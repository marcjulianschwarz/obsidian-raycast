export interface GlobalPreferences {
  vaultPath: string;
  configFileName: string;
  removeYAML: boolean;
  removeLinks: boolean;
  removeLatex: boolean;
  excludedPatterns: string;
  includedPatterns: string;
}

export interface AppendNotePreferences {
  appendTemplate: string;
  appendSelectedTemplate: string;
}
export interface NoteFormPreferences extends GlobalPreferences {
  blankNote: boolean;
  prefPath: string;
  prefNoteName: string;
  prefNoteContent: string;
  fillFormWithDefaults: boolean;
  defaultTags: string;
  defaultKeys: string;
  openOnCreate: boolean;
  folderActions: string;
  focusContentArea: boolean;
  prefEnableJDex: boolean;
  jdexRootTag: string;
  jdexTitleSeparator: string;
}

export interface SearchNotePreferences extends GlobalPreferences, AppendNotePreferences {
  primaryAction: string;
  showDetail: boolean;
  showMetadata: boolean;
  fuzzySearch: boolean;
  prefSearchMode: string;
  prefSearchScope: string;
  userDefinedSearchScope: string;
  prefLunrSearchOrder: boolean;
  prefSortOrder: string;
  prefLogicMode: string;
  yamlProperties: string;
  initialSearchText: string;
  prefilterSearchQuery: string;
}

export interface RandomNotePreferences extends GlobalPreferences, AppendNotePreferences {}

export interface SearchMediaPreferences extends GlobalPreferences {
  imageSize: string;
}

export interface DailyNoteAppendPreferences {
  appendTemplate?: string;
  vaultName?: string;
  heading?: string;
  prepend?: boolean;
  silent?: boolean;
}

export interface appendTaskPreferences {
  appendTemplate?: string;
  vaultName?: string;
  heading?: string;
  notePath?: string;
  noteTag?: string;
  silent?: boolean;
  creationDate?: boolean;
}
