import { detectPrintedBoxes } from '../pdf/checkboxes';
import type { AuxiliaryRequest } from './client';

self.onmessage = ({ data }: { data: Extract<AuxiliaryRequest, { kind: 'boxes' }> }) => {
  try {
    self.postMessage({
      result: detectPrintedBoxes(data.data, data.width, data.height, data.scale),
    });
  } catch {
    self.postMessage({
      error:
        'Impossible de repérer les cases sur cette page. Vous pouvez ajouter une case manuellement.',
    });
  }
};
