export const FEE_TYPES = ["tuition", "transport", "library", "exam", "hostel", "admission", "other"] as const;

export type FeeType = (typeof FEE_TYPES)[number];
