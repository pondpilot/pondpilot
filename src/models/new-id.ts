export type NewId<N extends string> = string & { readonly _: N };

export type NewIdFactory = <N extends NewId<any>>() => () => N;
