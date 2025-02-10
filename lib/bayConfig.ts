export type BayName = "Bay 1 (Bar)" | "Bay 2" | "Bay 3 (Entrance)";

export const BAY_DISPLAY_NAMES: Record<string, BayName> = {
  "Bay 1": "Bay 1 (Bar)",
  "Bay 2": "Bay 2",
  "Bay 3": "Bay 3 (Entrance)"
};

export const BAY_COLORS: Record<BayName, string> = {
  "Bay 1 (Bar)": "7",    // Purple/violet color
  "Bay 2": "6",          // Orange/coral color
  "Bay 3 (Entrance)": "4" // Green color
}; 