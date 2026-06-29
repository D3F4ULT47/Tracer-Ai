import argon2 from 'argon2';

export const passwordService = Object.freeze({
  hash(password) {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65_536,
      timeCost: 3,
      parallelism: 1,
    });
  },
  verify(hash, password) {
    return argon2.verify(hash, password);
  },
});
