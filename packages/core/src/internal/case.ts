/** snake_case 문자열 리터럴 타입을 camelCase 로 바꾼다. */
export type CamelCase<S extends string> = S extends `${infer Head}_${infer Tail}`
  ? `${Head}${Capitalize<CamelCase<Tail>>}`
  : S;

/** 객체 타입의 키를 camelCase 로 바꾼다. */
export type Camel<T> = { [K in keyof T as K extends string ? CamelCase<K> : K]: T[K] };

/** 교차 타입을 객체 하나로 펼친다. hover 와 에러 메시지에 `A & B` 대신 필드 목록이 보이게 하기 위해서다. */
export type Simplify<T> = { [K in keyof T]: T[K] } & {};

/**
 * 키는 그대로 필수로 두고 값에 `undefined` 를 허용한다. optional 필드를 채우다 하나를 빠뜨리는 실수를 막기 위해서다.
 * `-?` 로 optional 을 벗기면 TS 가 값에서 `undefined` 까지 지워 버리므로, 필수 키를 가진 타입에 쓴다.
 */
export type OrUndefined<T> = { [K in keyof T]: T[K] | undefined };
