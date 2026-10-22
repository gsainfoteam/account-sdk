import { faker, fakerKO } from '@faker-js/faker';

import { type FakeUser } from './fake-idp';

/**
 * 모든 claim 이 채워진 무작위 사용자를 만든다. 어떤 `requiredScopes` 로도 로그인할 수 있다.
 * 검사할 값은 `overrides` 로 고정한다.
 *
 * @example
 * ```ts
 * const user = fakeUser({ is_student_id_verified: false });
 * ```
 */
export function fakeUser(overrides: Partial<FakeUser> = {}): FakeUser {
  return {
    sub: faker.string.uuid(),
    name: fakerKO.person.lastName() + fakerKO.person.firstName(),
    profile: null,
    picture: faker.image.avatar(),
    email: `${faker.internet.username().toLowerCase()}@gm.gist.ac.kr`,
    student_id: `${faker.number.int({ min: 2018, max: 2026 })}${faker.string.numeric(4)}`,
    is_student_id_verified: true,
    phone_number: `010-${faker.string.numeric(4)}-${faker.string.numeric(4)}`,
    is_phone_number_verified: true,
    ...overrides,
  };
}
