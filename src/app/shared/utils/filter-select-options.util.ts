import { FilterSelectOption } from '@app/shared/components/filter-select/filter-select.component';

/** Opciones «N por página» (mismo formato que gestión de procesos). */
export function buildPerPageSelectOptions(
  sizes: readonly number[],
  perPageSuffix: string
): FilterSelectOption[] {
  return sizes.map((size) => ({
    id: String(size),
    label: `${size} ${perPageSuffix}`,
  }));
}

export function mapValueLabelToFilterOptions(
  items: readonly { value: string; label: string }[],
  placeholder?: { id: string; label: string }
): FilterSelectOption[] {
  const mapped = items.map((item) => ({ id: item.value, label: item.label }));
  return placeholder ? [placeholder, ...mapped] : mapped;
}
