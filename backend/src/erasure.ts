import { z } from 'zod';
import { asActor } from './database';
import type { Owner } from './auth';
import { ApiError } from './auth';

export async function eraseContact(owner: Owner, contactId: string): Promise<{ erased: true; contactId: string }> {
  const parsedId = z.string().uuid({ message: 'ID kontak harus berupa UUID yang valid.' }).parse(contactId);

  return asActor(owner.id, async (tx) => {
    const [row] = await tx<{ id: string }[]>`
      update app.contacts set
        name_ciphertext = null,
        phone_ciphertext = null,
        phone_hmac = null,
        phone_hint = null,
        email_ciphertext = null,
        email_hmac = null,
        erased_at = now(),
        updated_at = now()
      where id = ${parsedId}::uuid and erased_at is null
      returning id
    `;

    if (!row) {
      throw new ApiError(404, 'Kontak tidak ditemukan atau sudah dihapus.');
    }

    return { erased: true, contactId: row.id };
  });
}
