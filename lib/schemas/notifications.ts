import { z } from "zod";

export const notificationKindSchema = z.enum([
  "order.paid",
  "sale.received",
  // Seller-facing ARS payout leg (wapu_ars rail). `payout.pending`
  // fires when the withdrawal is opened; `payout.released` when Wapu
  // settles it to the bank; `payout.failed` when Wapu rejects it.
  "payout.pending",
  "payout.released",
  "payout.failed",
]);
export type NotificationKind = z.infer<typeof notificationKindSchema>;

export const notificationDtoSchema = z.object({
  id: z.string().uuid(),
  recipient_pubkey: z.string(),
  kind: notificationKindSchema,
  payload: z.record(z.string(), z.unknown()).nullable(),
  read_at: z.string().nullable(),
  created_at: z.string(),
});
export type NotificationDTO = z.infer<typeof notificationDtoSchema>;

export const notificationListResponseSchema = z.object({
  data: z.array(notificationDtoSchema),
});
export type NotificationListResponse = z.infer<
  typeof notificationListResponseSchema
>;

export const notificationPatchSchema = z.object({
  id: z.string().uuid(),
});
export type NotificationPatch = z.infer<typeof notificationPatchSchema>;
