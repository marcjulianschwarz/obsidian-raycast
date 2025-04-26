import { List, ActionPanel } from "@raycast/api";
import React, { useEffect, useState } from "react";
import fs from "fs";

import { readingTime, wordCount, trimPathToMaxLength, createdDateFor, fileSizeFor } from "../../../utils/utils";
import { yamlPropertyForString } from "../../../utils/yaml";
import { SearchNotePreferences } from "../../../utils/preferences";
import { Note } from "../../../api/vault/notes/notes.types";
import { Vault } from "../../../api/vault/vault.types";
import { filterContent, getNoteFileContent } from "../../../api/vault/vault.service";
import { renewCache } from "../../../api/cache/cache.service";

export function NoteListItem(props: {
  note: Note;
  vault: Vault;
  key: string;
  pref: SearchNotePreferences;
  action?: (note: Note, vault: Vault) => React.ReactFragment;
  selectedItemId: string | null;
}) {
  const { note, vault, pref, action } = props;
  const [noteContent, setNoteContent] = useState<string>();
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (props.selectedItemId === note.path && !noteContent) {
      setIsLoading(true);
      const loadNoteContent = async () => {
        try {
          const content = await getNoteFileContent(note.path);
          setNoteContent(content);
        } catch (error) {
          console.error("Failed to load note content:", error);
        } finally {
          setIsLoading(false);
        }
      };
      loadNoteContent();
    }
  }, [props.selectedItemId, note.path, noteContent]);

  const noteHasBeenMoved = !fs.existsSync(note.path);
  if (noteHasBeenMoved) {
    renewCache(vault);
  }

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
      return <React.Fragment />;
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
        <List.Item.Detail.Metadata.Label title="Creation Date" text={createdDateFor(note).toLocaleDateString()} />
        <List.Item.Detail.Metadata.Label title="File Size" text={fileSizeFor(note).toFixed(2) + " KB"} />
        <List.Item.Detail.Metadata.Label
          title="Note Path"
          text={trimPathToMaxLength(note.path.split(vault.path)[1], 55)}
        />
      </List.Item.Detail.Metadata>
    );
  }

  return !noteHasBeenMoved ? (
    <List.Item
      title={note.title}
      id={note.path}
      accessories={[
        {
          icon: note.bookmarked
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
          <React.Fragment>{action && action(note, vault)}</React.Fragment>
        </ActionPanel>
      }
    />
  ) : null;
}
