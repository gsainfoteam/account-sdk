export type CamelCase<S extends string> = S extends `${infer Head}_${infer Tail}`
  ? `${Head}${Capitalize<CamelCase<Tail>>}`
  : S;

export type Camel<T> = { [K in keyof T as K extends string ? CamelCase<K> : K]: T[K] };

/** hover와 에러 메시지에 `A & B` 대신 필드 목록이 보이게 하려고 쓴다. */
export type Simplify<T> = { [K in keyof T]: T[K] } & {};

/**
 * 키는 그대로 필수로 두고 값에 `undefined`를 허용한다. optional 필드를 채우다 하나를 빠뜨리는 실수를 막기 위해서다.
 * `-?`로 optional을 제거하면 TS가 값에서 `undefined`까지 지워 버리므로, 필수 키를 가진 타입에 쓴다.
 */
export type OrUndefined<T> = { [K in keyof T]: T[K] | undefined };
