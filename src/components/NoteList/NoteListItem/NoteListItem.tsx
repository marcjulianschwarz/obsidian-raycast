import { List, ActionPanel } from "@raycast/api";
import fs from "fs";
import { readingTime, wordCount, trimPathToMaxLength, createdDateFor, fileSizeFor } from "../../../utils/utils";
import { yamlPropertyForString } from "../../../utils/yaml";
import { SearchNotePreferences } from "../../../utils/preferences";
import { Note } from "../../../api/vault/notes/notes.types";
import { Vault } from "../../../api/vault/vault.types";
import { filterContent } from "../../../api/vault/vault.service";
import { renewCache } from "../../../api/cache/cache.service";
import { NoteActions, OpenNoteActions } from "../../../utils/actions";
import { useNoteContent } from "../../../utils/hooks";
import { useState } from "react";

export function NoteListItem(props: {
  note: Note;
  vault: Vault;
  key: string;
  pref: SearchNotePreferences;
  selectedItemId: string | null;
}) {
  const { note, vault, pref } = props;

  const [isBookmarked, setIsBookmarked] = useState(note.bookmarked);
  const isSelected = props.selectedItemId === note.path;
  const { noteContent, isLoading } = useNoteContent(note, { enabled: isSelected });

  const noteHasBeenMoved = !fs.existsSync(note.path);
  if (noteHasBeenMoved) {
    renewCache(vault);
  }

  // Create a modified note object with the current bookmark state
  const updatedNote = { ...note, bookmarked: isBookmarked };

  function TagList() {
    return null;
    // if (note.tags.length > 0) {
    //   return (
    //     <List.Item.Detail.Metadata.TagList title="Tags">
    //       {note.tags.map((tag) => (
    //         <List.Item.Detail.Metadata.TagList.Item key={tag} text={tag} />
    //       ))}
    //     </List.Item.Detail.Metadata.TagList>
    //   );
    // } else {
    //   return null;
    // }
  }

  function Link() {
    if (!noteContent) return null;
    const url = yamlPropertyForString(noteContent, "url");
    if (url) {
      return <List.Item.Detail.Metadata.Link target={url} text="View" title="URL" />;
    } else {
      return null;
    }
  }

  function renderMetadata() {
    if (!noteContent || !pref.showMetadata) {
      return <></>;
    }

    return (
      <List.Item.Detail.Metadata>
        <List.Item.Detail.Metadata.Label title="Character Count" text={noteContent.length.toString()} />
        <List.Item.Detail.Metadata.Label title="Word Count" text={wordCount(noteContent).toString()} />
        <List.Item.Detail.Metadata.Label
          title="Reading Time"
          text={readingTime(noteContent).toString() + " min read"}
        />
        <TagList />
        <Link />
        <List.Item.Detail.Metadata.Separator />
        <List.Item.Detail.Metadata.Label
          title="Creation Date"
          text={createdDateFor(updatedNote).toLocaleDateString()}
        />
        <List.Item.Detail.Metadata.Label title="File Size" text={fileSizeFor(updatedNote).toFixed(2) + " KB"} />
        <List.Item.Detail.Metadata.Label
          title="Note Path"
          text={trimPathToMaxLength(updatedNote.path.split(vault.path)[1], 55)}
        />
      </List.Item.Detail.Metadata>
    );
  }

  return !noteHasBeenMoved ? (
    <List.Item
      title={updatedNote.title}
      id={updatedNote.path}
      accessories={[
        {
          icon: isBookmarked
            ? {
                source: "bookmark.svg",
              }
            : null,
        },
      ]}
      detail={
        <List.Item.Detail
          isLoading={isLoading}
          markdown={filterContent(noteContent ?? "")}
          metadata={noteContent ? renderMetadata() : null}
        />
      }
      actions={
        <ActionPanel>
          <OpenNoteActions note={{ content: noteContent ?? "", ...updatedNote }} vault={vault} />
          <NoteActions
            note={{ content: noteContent ?? "", ...updatedNote }}
            vault={vault}
            onNoteAction={(actionType) => {
              switch (actionType) {
                case "bookmark":
                  setIsBookmarked(true);
                  break;
                case "unbookmark":
                  setIsBookmarked(false);
                  break;
              }
            }}
          />
        </ActionPanel>
      }
    />
  ) : null;
}
