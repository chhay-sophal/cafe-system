import { ref, type Ref } from "vue";
import { t } from "../i18n";
import type { ReceiptBlock } from "../lib/receipt";

const STORAGE_KEY = "pos.storeDetails";

export const ADDRESS_MAX_LENGTH = 200;
export const CONTACT_MAX_LENGTH = 60;
// Each list prints a line per entry (or one joined line), so a few is plenty
// before the receipt header turns into a page.
export const CONTACT_MAX_ENTRIES = 3;

export const SOCIAL_PLATFORMS = ["FACEBOOK", "INSTAGRAM", "TIKTOK", "TELEGRAM", "WEBSITE", "OTHER"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export interface SocialLink {
  platform: SocialPlatform;
  handle: string;
}

export interface StoreDetails {
  address: string;
  phones: string[];
  emails: string[];
  socials: SocialLink[];
}

export type ContactList = "phones" | "emails";

function emptyDetails(): StoreDetails {
  return { address: "", phones: [], emails: [], socials: [] };
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string").slice(0, CONTACT_MAX_ENTRIES)
    : [];
}

function load(): StoreDetails {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<StoreDetails> | null;
    if (!parsed || typeof parsed !== "object") {
      return emptyDetails();
    }
    const socials = Array.isArray(parsed.socials)
      ? parsed.socials
          .filter(
            (link): link is SocialLink =>
              typeof link?.handle === "string" && (SOCIAL_PLATFORMS as readonly string[]).includes(link?.platform),
          )
          .slice(0, CONTACT_MAX_ENTRIES)
      : [];
    return {
      address: typeof parsed.address === "string" ? parsed.address : "",
      phones: strings(parsed.phones),
      emails: strings(parsed.emails),
      socials,
    };
  } catch {
    return emptyDetails();
  }
}

// Per register, like the store name: each branch prints its own address and
// contacts. Everything is optional - empty parts are left off the receipt.
const details: Ref<StoreDetails> = ref(load());

function save(next: StoreDetails) {
  details.value = next;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

function setAddress(address: string) {
  // Trim each line and drop blank ones, so stray Enter presses don't print
  // empty lines on the receipt.
  const cleaned = address
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, ADDRESS_MAX_LENGTH);
  save({ ...details.value, address: cleaned });
}

export type ContactAddError = "invalid" | "duplicate" | "full";

// Loose on purpose - formats vary (+855 12 345 678, 012-345-678, (023) ...):
// digits with the usual separators, and at least six digits.
function isValidPhone(value: string): boolean {
  return /^[+(\d][\d\s\-().]*$/.test(value) && value.replace(/\D/g, "").length >= 6;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function addContact(list: ContactList, value: string): ContactAddError | null {
  const entry = value.trim();
  const current = details.value[list];
  const valid = list === "phones" ? isValidPhone(entry) : isValidEmail(entry);
  if (!valid || entry.length > CONTACT_MAX_LENGTH) {
    return "invalid";
  }
  if (current.some((existing) => existing.toLowerCase() === entry.toLowerCase())) {
    return "duplicate";
  }
  if (current.length >= CONTACT_MAX_ENTRIES) {
    return "full";
  }
  save({ ...details.value, [list]: [...current, entry] });
  return null;
}

function removeContact(list: ContactList, index: number) {
  save({ ...details.value, [list]: details.value[list].filter((_, i) => i !== index) });
}

function addSocial(platform: SocialPlatform, handle: string): ContactAddError | null {
  const entry = handle.trim();
  const current = details.value.socials;
  if (entry === "" || entry.length > CONTACT_MAX_LENGTH) {
    return "invalid";
  }
  if (current.some((link) => link.platform === platform && link.handle.toLowerCase() === entry.toLowerCase())) {
    return "duplicate";
  }
  if (current.length >= CONTACT_MAX_ENTRIES) {
    return "full";
  }
  save({ ...details.value, socials: [...current, { platform, handle: entry }] });
  return null;
}

function removeSocial(index: number) {
  save({ ...details.value, socials: details.value.socials.filter((_, i) => i !== index) });
}

// "Facebook: Cafe Phnom Penh" - Other has no label, just the text as typed.
export function formatSocialLink(link: SocialLink): string {
  return link.platform === "OTHER" ? link.handle : `${t(`storeDetails.platforms.${link.platform}`)}: ${link.handle}`;
}

// Printed under the store name: address, then phones and emails. Shared by
// sale receipts and the Settings test receipt so they always match.
export function storeHeaderBlocks(): ReceiptBlock[] {
  const { address, phones, emails } = details.value;
  const blocks: ReceiptBlock[] = [];
  for (const line of address.split("\n").filter(Boolean)) {
    blocks.push({ type: "text", text: line, align: "center", size: "small" });
  }
  if (phones.length > 0) {
    blocks.push({ type: "text", text: t("storeDetails.receiptPhone", { phones: phones.join(" / ") }), align: "center", size: "small" });
  }
  for (const email of emails) {
    blocks.push({ type: "text", text: email, align: "center", size: "small" });
  }
  return blocks;
}

// Printed after "Thank you", where customers look for where to follow the shop.
export function storeFooterBlocks(): ReceiptBlock[] {
  return details.value.socials.map((link) => ({
    type: "text",
    text: formatSocialLink(link),
    align: "center",
    size: "small",
  }));
}

export function useStoreDetails() {
  return { details, setAddress, addContact, removeContact, addSocial, removeSocial };
}
