import { List, Icon } from "@raycast/api";

type SortOrder = "az" | "za" | "mn" | "mo" | "cn" | "co";

export function NoteListDropdown(props: {
  sortOrder: SortOrder;
  setSortOrder: (o: SortOrder) => void;
}) {
  const { sortOrder, setSortOrder } = props;

  return (
    <List.Dropdown
      tooltip="Sort Notes"
      value={sortOrder}
      onChange={(v) => setSortOrder(v as SortOrder)}
      storeValue={false}
    >
      <List.Dropdown.Section title="Sort Notes">
        <List.Dropdown.Item value="az" title="File name (A to Z)" icon={Icon.ArrowDown} />
        <List.Dropdown.Item value="za" title="File name (Z to A)" icon={Icon.ArrowUp} />
        <List.Dropdown.Item value="mn" title="Modified time (new to old)" icon={Icon.Clock} />
        <List.Dropdown.Item value="mo" title="Modified time (old to new)" icon={Icon.Clock} />
        <List.Dropdown.Item value="cn" title="Created time (new to old)" icon={Icon.Calendar} />
        <List.Dropdown.Item value="co" title="Created time (old to new)" icon={Icon.Calendar} />
      </List.Dropdown.Section>
    </List.Dropdown>
  );
}