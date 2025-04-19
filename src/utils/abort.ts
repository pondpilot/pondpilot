export function makeAbortable<R extends (...params: any) => Promise<any>>(
  fn: R,
  abortPromise: ReturnType<R> extends Promise<infer IR> ? Promise<IR | never> : never,
): R {
  return ((...params: Parameters<R>) => Promise.race([fn(...params), abortPromise])) as R;
}
