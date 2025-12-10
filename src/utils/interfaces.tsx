import { Image } from "@raycast/api";

export interface SearchArguments {
  searchArgument?: string;
  tagArgument?: string;
}

export interface Media {
  title: string;
  path: string;
  icon: Image;
}

export interface MediaState {
  ready: boolean;
  media: Media[];
}

export interface MediaSearchArguments {
  searchArgument: string;
  typeArgument: string;
}
