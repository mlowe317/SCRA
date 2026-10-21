import type { Prisma } from "@prisma/client";

type Num = Prisma.Decimal | number | string | null | undefined;

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function formatMoney(value: Num): string {
  if (value === null || value === undefined) return "";
  return usd.format(Number(value.toString()));
}

export function formatRate(value: Num): string {
  if (value === null || value === undefined) return "";
  return `${Number(value.toString()).toFixed(3)}%`;
}
