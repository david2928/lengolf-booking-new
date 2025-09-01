export type BayType = 'social' | 'ai_lab';
export type BayName = "Bay 1 (Bar)" | "Bay 2" | "Bay 3 (Entrance)" | "LENGOLF AI Lab";

export interface BayInfo {
  displayName: string;
  type: BayType;
  color: string;
  icon: string;
  maxRecommendedPeople?: number;
  experienceLevel?: 'all' | 'experienced';
  groupSize?: 'small' | 'large';
  leftHandedFriendly?: boolean;
  description?: string;
}

export const BAY_CONFIGURATION: Record<string, BayInfo> = {
  "Bay 1": {
    displayName: "Bay 1 (Bar)",
    type: "social",
    color: "green",
    icon: "users",
    experienceLevel: "all",
    groupSize: "large",
    description: "Social bay perfect for beginners and groups"
  },
  "Bay 2": {
    displayName: "Bay 2",
    type: "social", 
    color: "green",
    icon: "users",
    experienceLevel: "all",
    groupSize: "large",
    description: "Social bay perfect for beginners and groups"
  },
  "Bay 3": {
    displayName: "Bay 3 (Entrance)",
    type: "social",
    color: "green",
    icon: "users",
    experienceLevel: "all",
    groupSize: "large",
    description: "Social bay perfect for beginners and groups"
  },
  "Bay 4": {
    displayName: "LENGOLF AI Lab",
    type: "ai_lab",
    color: "purple",
    icon: "chip",
    maxRecommendedPeople: 2,
    experienceLevel: "experienced",
    leftHandedFriendly: true,
    description: "AI-powered swing analysis for experienced players"
  }
};

// Legacy support - keep existing exports for backward compatibility
export const BAY_DISPLAY_NAMES: Record<string, string> = {
  "Bay 1": "Bay 1 (Bar)",
  "Bay 2": "Bay 2",
  "Bay 3": "Bay 3 (Entrance)",
  "Bay 4": "Bay 4"
};

export const BAY_COLORS: Record<string, string> = {
  "Bay 1 (Bar)": "7",    // Purple/violet color
  "Bay 2": "6",          // Orange/coral color
  "Bay 3 (Entrance)": "4", // Green color
  "Bay 4": "1"  // Purple color
};

// Helper functions
export const getSocialBays = (): string[] => 
  Object.entries(BAY_CONFIGURATION)
    .filter(([_, info]) => info.type === 'social')
    .map(([key, _]) => key);

export const getAILabBays = (): string[] =>
  Object.entries(BAY_CONFIGURATION)
    .filter(([_, info]) => info.type === 'ai_lab')
    .map(([key, _]) => key);

export const getBayInfo = (bayKey: string): BayInfo | undefined => {
  return BAY_CONFIGURATION[bayKey];
};

export const getBayTypeFromKey = (bayKey: string): BayType | undefined => {
  return BAY_CONFIGURATION[bayKey]?.type;
};

export const isSocialBay = (bayKey: string): boolean => {
  return BAY_CONFIGURATION[bayKey]?.type === 'social';
};

export const isAILabBay = (bayKey: string): boolean => {
  return BAY_CONFIGURATION[bayKey]?.type === 'ai_lab';
}; 