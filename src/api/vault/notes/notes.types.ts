export type Note = {
  title: string;
  path: string;
  created: Date;
  modified: Date;
  tags: string[];
  content: string;
  bookmarked?: boolean;
  aliases: string[];
  locations: string[];
  [key:string]: any; // Additional properties from YAML frontmatter
};

export type CreateNoteParams = {
  path: string;
  name: string;
  jdex: string;
  fullName: string;
  content: string;
  tags: string[];
  locations: string[];
  availableTags: string[];
  allNotes: Note[];
  yamlKeys: string;
};

export interface CodeBlock {
  language: string;
  code: string;
}
