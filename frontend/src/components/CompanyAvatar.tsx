/**
 * CompanyAvatar — the logo of an account, with a graceful fallback.
 *
 * Shows account.logoUrl when set; if the image is missing or fails to load
 * (dead link, offline, hotlink blocked) we fall back to a coloured initials
 * chip so the row never renders an empty box.
 *
 * The initials skip Vietnamese legal-entity and sector boilerplate — nearly
 * every account here is named "CÔNG TY ...", so first-letter initials made
 * every avatar a "C". "CÔNG TY CỔ PHẦN BÌNH ĐIỀN - MEKONG" becomes "BM",
 * "TRƯỜNG TRUNG - TIỂU HỌC PÉTRUS KÝ" becomes "PK". Accounts that still
 * collide are separated by the colour, which is hashed from the full name.
 */
import { useState } from "react";
import { cn } from "@/lib/cn";

// Dropped before picking initials. Order matters: multi-word entries are
// stripped as phrases, so "TRÁCH NHIỆM HỮU HẠN" goes before "HỮU HẠN".
const NOISE_WORDS = [
  "công ty trách nhiệm hữu hạn",
  "công ty cổ phần",
  "công ty tnhh",
  "tổng công ty",
  "doanh nghiệp tư nhân",
  "hộ kinh doanh",
  "chi nhánh",
  "công ty",
  "ctcp",
  "cty",
  "tnhh",
  "cổ phần",
  "trách nhiệm hữu hạn",
  "phòng khám đa khoa",
  "phòng khám",
  "pkđk",
  "đa khoa",
  "bệnh viện",
  "ngân hàng thương mại cổ phần",
  "ngân hàng",
  "tmcp",
  "trường cao đẳng",
  "trường trung",
  "trường tiểu học",
  "tiểu học",
  "trung học",
  "cao đẳng",
  "trường",
  "hệ thống",
  "y khoa",
  "thương mại dịch vụ",
  "thương mại",
  "dịch vụ",
  "đầu tư và phát triển",
  "đầu tư",
  "phát triển",
  "sản xuất",
  "kinh doanh",
  "chế biến",
  "giáo dục",
  "công nghệ",
  "việt nam",
  // Common abbreviations in imported names: đầu tư, sản xuất, kinh doanh.
  "đt",
  "sx",
  "kd",
].map((w) => w.normalize("NFC"));

export function companyInitials(name: string): string {
  // Account names arrive with mixed Unicode normalisation — the Excel import
  // stored decomposed diacritics, later rows composed — so a raw match drops
  // no boilerplate at all and every avatar reads "CT" (CÔNG TY).
  let s = name.normalize("NFC").toLowerCase();
  for (const w of NOISE_WORDS) s = s.split(w).join(" ");
  const words = s
    .replace(/[-–—_.,()/]+/g, " ")
    .split(/\s+/)
    // Drop pure numbers and roman numerals ("Bệnh Viện II Lâm Đồng" → "LĐ").
    .filter((w) => w.length > 0 && !/^\d+$/.test(w) && !/^[ivx]+$/.test(w));

  // Everything was boilerplate (e.g. "Công ty TNHH Dịch vụ") — fall back to
  // the original name so we still show something meaningful.
  const source = words.length
    ? words
    : name.normalize("NFC").split(/\s+/).filter(Boolean);
  return source
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-violet-100 text-violet-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-700",
  "bg-indigo-100 text-indigo-700",
  "bg-teal-100 text-teal-700",
];

export function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

export function CompanyAvatar({
  name,
  logoUrl,
  className,
  textClassName,
}: {
  name: string;
  logoUrl?: string | null;
  /** Size + shape, e.g. "h-9 w-9 rounded-lg". */
  className?: string;
  /** Font size for the initials fallback. */
  textClassName?: string;
}) {
  const [broken, setBroken] = useState(false);

  if (logoUrl && !broken) {
    return (
      <img
        src={logoUrl}
        alt={name}
        loading="lazy"
        onError={() => setBroken(true)}
        title={name}
        className={cn(
          "shrink-0 border border-slate-200 bg-white object-contain p-0.5",
          className,
        )}
      />
    );
  }

  return (
    <span
      title={name}
      className={cn(
        "flex shrink-0 items-center justify-center font-bold uppercase",
        avatarColor(name),
        className,
        textClassName ?? "text-sm",
      )}
    >
      {companyInitials(name)}
    </span>
  );
}
