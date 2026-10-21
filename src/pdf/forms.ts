import {
  PDFDocument,
  PDFTextField,
  PDFCheckBox,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFName,
  PDFHexString,
  rgb,
  degrees,
  componentsToColor,
  type PDFField,
  type PDFPage,
  type PDFFont,
  type PDFWidgetAnnotation,
} from 'pdf-lib';
import type { FormValue, PageRef } from '../types';
import { sameBox } from './geometry';

type SupportedField = PDFTextField | PDFCheckBox | PDFDropdown | PDFOptionList | PDFRadioGroup;
export function supportedField(field: PDFField): field is SupportedField {
  return (
    (field instanceof PDFTextField && !field.isPassword() && !field.isRichFormatted()) ||
    field instanceof PDFCheckBox ||
    field instanceof PDFDropdown ||
    field instanceof PDFOptionList ||
    field instanceof PDFRadioGroup
  );
}
function widgetOnPage(source: PDFDocument, index: number, widget: PDFWidgetAnnotation) {
  const page = source.getPage(index);
  if (widget.P()) return widget.P()!.toString() === page.ref.toString();
  return (
    page.node
      .Annots()
      ?.asArray()
      .some((ref) => source.context.lookup(ref) === widget.dict) ?? false
  );
}
export function flattenUnsupportedFields(source: PDFDocument) {
  const form = source.getForm();
  const fields = form.getFields().filter((field) => !supportedField(field));
  // Isolated source copy only. Supported widgets are rebuilt safely; never copy
  // their Parent/Kids graph, actions or pages belonging to omitted source pages.
  form.acroForm.dict.set(
    PDFName.of('Fields'),
    source.context.obj(fields.map((field) => field.ref)),
  );
  if (fields.length) form.flatten({ updateFieldAppearances: false });
}
function currentValue(field: SupportedField): FormValue {
  if (field instanceof PDFTextField) return field.getText() ?? '';
  if (field instanceof PDFCheckBox) return field.isChecked();
  if (field instanceof PDFRadioGroup) return field.getSelected() ?? '';
  return field.getSelected();
}

export class FormBuilder {
  private targets = new Map<string, SupportedField>();
  private pendingChoices: (() => void)[] = [];
  private names = new Set<string>();
  constructor(
    private output: PDFDocument,
    private font: PDFFont,
  ) {}
  private name(original: string) {
    const root = original.replace(/[\u0000-\u001f]/g, '').slice(0, 180) || 'Champ';
    let name = root,
      counter = 2;
    while (this.names.has(name)) name = `${root} (${counter++})`;
    this.names.add(name);
    return name;
  }
  addPage(source: PDFDocument, page: PDFPage, ref: PageRef, group: string) {
    const form = this.output.getForm();
    for (const field of source.getForm().getFields()) {
      if (!supportedField(field)) continue;
      const widgets = field.acroField.getWidgets();
      const selected = widgets
        .map((widget, i) => ({ widget, i }))
        .filter(({ widget }) => widgetOnPage(source, ref.index, widget));
      if (!selected.length) continue;
      const stored =
        ref.formValues && Object.hasOwn(ref.formValues, field.getName())
          ? ref.formValues[field.getName()]
          : undefined;
      let value = field.isReadOnly() ? currentValue(field) : (stored ?? currentValue(field));
      if (!field.isReadOnly() && field instanceof PDFCheckBox && stored === undefined) {
        const legacy = ref.annotations.find(
          (a) =>
            a.type === 'checkbox' &&
            a.id.startsWith('widget-') &&
            selected.some(({ widget }) => sameBox(a, widget.getRectangle())),
        );
        if (legacy) value = legacy.checked ?? false;
      }
      const key = `${group}:${field.getName()}`;
      let target = this.targets.get(key);
      if (!target) {
        const name = this.name(field.getName());
        if (field instanceof PDFTextField) {
          const f = form.createTextField(name);
          if (field.isMultiline()) f.enableMultiline();
          if (field.getMaxLength()) f.setMaxLength(field.getMaxLength());
          f.setAlignment(field.getAlignment());
          f.setText(typeof value === 'string' ? value : '');
          target = f;
        } else if (field instanceof PDFCheckBox) {
          const f = form.createCheckBox(name);
          value ? f.check() : f.uncheck();
          target = f;
        } else if (field instanceof PDFRadioGroup) target = form.createRadioGroup(name);
        else {
          const f =
            field instanceof PDFDropdown ? form.createDropdown(name) : form.createOptionList(name);
          const options = field.acroField
            .getOptions()
            .map((o) => ({
              value: o.value.decodeText(),
              display: (o.display ?? o.value).decodeText(),
            }));
          f.setOptions(options.map((o) => o.display));
          if (field.isMultiselect()) f.enableMultiselect();
          const values = (
            Array.isArray(value) ? value : typeof value === 'string' && value ? [value] : []
          ).slice(0, field.isMultiselect() ? 100 : 1);
          const editable = field instanceof PDFDropdown && field.isEditable();
          const choices = values
            .map(
              (v) =>
                options.find((o) => o.value === v || o.display === v) ??
                (editable ? { value: v, display: v } : undefined),
            )
            .filter((o) => !!o);
          if (f instanceof PDFDropdown && field instanceof PDFDropdown && field.isEditable())
            f.enableEditing();
          f.select(choices.map((o) => o.display));
          // pdf-lib's choice appearance provider expects display labels. Build
          // that appearance first, then restore the actual export codes /V /Opt.
          this.pendingChoices.push(() => {
            f.acroField.setOptions(
              options.map((o) => ({
                value: PDFHexString.fromText(o.value),
                display: PDFHexString.fromText(o.display),
              })),
            );
            const codes = choices.map((o) => PDFHexString.fromText(o.value));
            if (!codes.length) f.acroField.dict.delete(PDFName.of('V'));
            else
              f.acroField.dict.set(
                PDFName.of('V'),
                codes.length === 1 ? codes[0] : this.output.context.obj(codes),
              );
            if (codes.length > 1)
              f.acroField.dict.set(
                PDFName.of('I'),
                this.output.context.obj(
                  choices.map((o) => options.indexOf(o)).sort((a, b) => a - b),
                ),
              );
          });
          target = f;
        }
        if (field.isReadOnly()) target.enableReadOnly();
        if (field.isRequired()) target.enableRequired();
        this.targets.set(key, target);
      }
      for (const { widget, i } of selected) {
        const rectangle = widget.getRectangle();
        const appearance = widget.getAppearanceCharacteristics();
        const width = widget.getBorderStyle()?.getWidth() ?? 1;
        const options = {
          ...rectangle,
          borderWidth: width,
          borderColor: componentsToColor(appearance?.getBorderColor()) ?? rgb(0.25, 0.28, 0.34),
          backgroundColor: componentsToColor(appearance?.getBackgroundColor()) ?? rgb(1, 1, 1),
          textColor: rgb(0, 0, 0),
          rotate: degrees(appearance?.getRotation() ?? 0),
          font: this.font,
        };
        if (target instanceof PDFRadioGroup && field instanceof PDFRadioGroup)
          target.addOptionToPage(field.getOptions()[i] ?? String(i), page, options);
        else if (!(target instanceof PDFRadioGroup)) target.addToPage(page, options);
        const newWidget = target.acroField.getWidgets().at(-1)!;
        newWidget.setRectangle(rectangle);
        // addToPage creates a widget in the Off appearance state. Synchronize
        // every widget only after it exists, otherwise /V and /AS disagree.
        if (target instanceof PDFCheckBox) value ? target.check() : target.uncheck();
        if (widget.hasFlag(2) || widget.hasFlag(1)) newWidget.setFlagTo(2, true);
      }
      if (
        target instanceof PDFRadioGroup &&
        typeof value === 'string' &&
        value &&
        target.getOptions().includes(value)
      )
        target.select(value);
      if (
        target instanceof PDFTextField ||
        target instanceof PDFDropdown ||
        target instanceof PDFOptionList
      ) {
        const da = field.acroField.getDefaultAppearance() ?? '';
        const size = Number(/(?:\s|^)([\d.]+)\s+Tf/.exec(da)?.[1] ?? 0);
        target.setFontSize(Number.isFinite(size) && size >= 0 && size <= 144 ? size : 0);
        target.defaultUpdateAppearances(this.font);
      }
    }
  }
  finish() {
    this.output.getForm().updateFieldAppearances(this.font);
    for (const finish of this.pendingChoices) finish();
  }
}
