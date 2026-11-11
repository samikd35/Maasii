import { z } from "zod";
import { MaasiiError } from "./errors";

/** How staff sign in: an email address, or a phone number in E.164 form (+251912345678). */
export type StaffContact = { email: string } | { phone: string };

/**
 * Reads an email or phone number as staff type it. Ethiopian numbers may be written locally
 * (0911 234 567, 911234567) or internationally (+251 911 234 567); all become +251911234567.
 */
export function parseStaffContact(input: string): StaffContact {
  const text = input.trim();
  if (text.includes("@")) {
    const email = z.email().safeParse(text.toLowerCase());
    if (email.success) return { email: email.data };
    throw new MaasiiError("invalid_input", "That email address doesn't look right.");
  }

  const digits = text.replace(/[\s().-]/g, "");
  const ethiopian = digits.match(/^(?:\+?251|0)?([79]\d{8})$/);
  if (ethiopian) return { phone: `+251${ethiopian[1]}` };
  if (/^\+[1-9]\d{7,14}$/.test(digits)) return { phone: digits };
  throw new MaasiiError("invalid_input", "Enter an email address or a phone number such as 0911 234 567.");
}

export function contactText(contact: StaffContact): string {
  return "email" in contact ? contact.email : contact.phone;
}
