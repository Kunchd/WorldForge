// @ts-check

export const MODEL_OPTIONS = /** @type {const} */ ([
  {
    id: 'gpt-6-astra',
    label: 'Celestia',
    detail: 'GPT-6 Astra',
  },
  {
    id: 'gpt-5.6-sol',
    label: 'Mythril',
    detail: 'GPT-5.6 Sol',
  },
  {
    id: 'gpt-5.6-luna',
    label: 'Gold',
    detail: 'GPT-5.6 Luna',
  },
  {
    id: 'gpt-5.4',
    label: 'Blue',
    detail: 'GPT-5.4',
  },
]);

export const DEFAULT_MODEL_ID = 'gpt-5.4';

/**
 * @param {unknown} value
 * @returns {value is (typeof MODEL_OPTIONS)[number]['id']}
 */
export function isModelId(value) {
  return MODEL_OPTIONS.some((option) => option.id === value);
}

/**
 * @param {(typeof MODEL_OPTIONS)[number]['id']} modelId
 */
export function modelLabel(modelId) {
  return MODEL_OPTIONS.find((option) => option.id === modelId)?.label ?? 'Blue';
}
