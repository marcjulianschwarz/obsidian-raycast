export type Note = {
  title: string;
  path: string;
  lastModified: Date;
  tags: string[];
  content: string;
  bookmarked: boolean;
  aliases: string[];
  locations: string[];
  index: string;
};

export type CreateNoteParams = {
  path: string;
  name: string;
  content: string;
  tags: string[];
  availableTags?: string[];
  fullName?: string;
};

export interface CodeBlock {
  language: string;
  code: string;
}
