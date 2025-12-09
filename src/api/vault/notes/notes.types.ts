export interface Note {
  title: string;
  path: string;
  lastModified: Date;
  bookmarked: boolean;
}

export interface NoteWithContent extends Note {
  content: string;
}

export interface CreateNoteParams {
  path: string;
  name: string;
  content: string;
  tags: string[];
}

export interface CodeBlock {
  language: string;
  code: string;
}
