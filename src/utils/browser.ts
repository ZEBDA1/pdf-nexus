export function bounded<T>(operation: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    operation.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}
