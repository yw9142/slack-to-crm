type ViewField = {
  universalIdentifier: string;
  fieldMetadataUniversalIdentifier: string;
  position: number;
  isVisible?: boolean;
  size?: number;
};

export const createViewFields = (fields: readonly ViewField[]) =>
  fields.map((field) => ({
    ...field,
    isVisible: field.isVisible ?? true,
    size: field.size ?? 180,
  }));
