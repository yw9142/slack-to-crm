const MARKDOWN_TABLE_SEPARATOR_CELL_PATTERN = /^:?-{3,}:?$/;
const HANGUL_PATTERN = /[가-힣]/;
const KOREAN_WON_AMOUNT_PATTERN =
  /(^|[^\dA-Za-z가-힣-])((?:₩\s*|KRW\s*)?)(\d{1,3}(?:,\d{3})+|\d{5,})(\s*원)?(?=$|[^\dA-Za-z-])/gi;
const MONEY_CONTEXT_PATTERN =
  /금액|매출|계약금|예산|가격|단가|총액|합계|수주액|amount|revenue|value|price|budget|arr|mrr/i;

export const formatSlackRichAnswer = (value: string): string => {
  if (value.length === 0) {
    return value;
  }

  const normalizedLineEndings = value.replace(/\r\n?/g, '\n');
  const withoutMarkdownTables = convertMarkdownTables(normalizedLineEndings);
  const withSlackMarkdown = convertMarkdownToSlackMrkdwn(withoutMarkdownTables);
  const withKoreanMoneyUnits =
    normalizeKoreanWonAmountsInText(withSlackMarkdown);
  const withReadableRecordBlocks =
    expandDenseLabeledBulletLines(withKoreanMoneyUnits);
  const withSlackSectionSpacing = normalizeSlackSectionSpacing(
    withReadableRecordBlocks,
  );

  return moveConfirmationSectionsToBottom(withSlackSectionSpacing);
};

const convertMarkdownTables = (value: string): string => {
  const lines = value.split('\n');
  const formattedLines: string[] = [];
  let isInsideCodeFence = false;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? '';

    if (line.trimStart().startsWith('```')) {
      isInsideCodeFence = !isInsideCodeFence;
      formattedLines.push(line);
      continue;
    }

    const nextLine = lines[lineIndex + 1];

    if (
      !isInsideCodeFence &&
      nextLine !== undefined &&
      isMarkdownTableSeparatorLine(nextLine)
    ) {
      const headers = parseMarkdownTableRow(line);

      if (headers.length > 0) {
        const rows: string[][] = [];
        let rowIndex = lineIndex + 2;

        while (rowIndex < lines.length) {
          const rowLine = lines[rowIndex] ?? '';

          if (!rowLine.includes('|') || rowLine.trim().length === 0) {
            break;
          }

          const row = parseMarkdownTableRow(rowLine);

          if (row.length === 0) {
            break;
          }

          rows.push(row);
          rowIndex += 1;
        }

        if (rows.length > 0) {
          formattedLines.push(...formatMarkdownTableRows(headers, rows));
          lineIndex = rowIndex - 1;
          continue;
        }
      }
    }

    formattedLines.push(line);
  }

  return formattedLines.join('\n');
};

const parseMarkdownTableRow = (line: string): string[] => {
  if (!line.includes('|')) {
    return [];
  }

  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
};

const isMarkdownTableSeparatorLine = (line: string): boolean => {
  const cells = parseMarkdownTableRow(line);

  return (
    cells.length > 0 &&
    cells.every((cell) => MARKDOWN_TABLE_SEPARATOR_CELL_PATTERN.test(cell))
  );
};

const formatMarkdownTableRows = (
  headers: string[],
  rows: string[][],
): string[] =>
  rows.map((row) => {
    const formattedCells = row
      .map((cell, cellIndex) => {
        const header = headers[cellIndex]?.trim();

        if (!header) {
          return undefined;
        }

        const formattedHeader = convertInlineMarkdownToSlack(header);
        const formattedCell = normalizeKoreanWonAmountCell(
          convertInlineMarkdownToSlack(cell),
          header,
        );

        return {
          label: formattedHeader,
          value: formattedCell,
        };
      })
      .filter((cell): cell is LabeledField => cell !== undefined);

    return formatLabeledFieldsAsSlackBlock(formattedCells);
  });

type LabeledField = {
  label: string;
  value: string;
};

const expandDenseLabeledBulletLines = (value: string): string =>
  value
    .split('\n')
    .map((line) => {
      const bulletMatch = line.match(/^([•*-])\s+(.+)$/);

      if (!bulletMatch) {
        return line;
      }

      const fields = parseDenseLabeledFields(bulletMatch[2] ?? '');

      if (fields.length < 3) {
        return line;
      }

      const formattedBlock = formatLabeledFieldsAsSlackBlock(fields);

      return formattedBlock === line ? line : formattedBlock;
    })
    .join('\n');

const parseDenseLabeledFields = (value: string): LabeledField[] => {
  const parts = value.split(/\s+·\s+/);

  if (parts.length < 3) {
    return [];
  }

  const fields = parts
    .map((part) => {
      const match = part.match(/^\*([^*\n]{1,48})\*:\s*(.*)$/);

      if (!match) {
        return undefined;
      }

      return {
        label: match[1]?.trim() ?? '',
        value: match[2]?.trim() ?? '',
      };
    })
    .filter((field): field is LabeledField =>
      Boolean(field?.label && field.value),
    );

  return fields.length === parts.length ? fields : [];
};

const formatLabeledFieldsAsSlackBlock = (fields: LabeledField[]): string => {
  if (fields.length === 0) {
    return '';
  }

  const primaryFieldIndex = findPrimaryFieldIndex(fields);
  const primaryField = fields[primaryFieldIndex] ?? fields[0];

  if (!primaryField) {
    return '';
  }

  const title = buildPrimaryTitle(primaryField, fields);
  const detailFields = fields.filter(
    (field, fieldIndex) =>
      fieldIndex !== primaryFieldIndex && !shouldHideDetailField(field, fields),
  );

  const inlineDetails = buildInlineFieldLine(detailFields);

  if (detailFields.length <= 2 && inlineDetails.length < 90) {
    return `• *${title}*${detailFields.length > 0 ? ` · ${inlineDetails}` : ''}`;
  }

  return [
    `• *${title}*`,
    ...groupDetailFields(detailFields).map((line) => `  ${line}`),
  ].join('\n');
};

const findPrimaryFieldIndex = (fields: LabeledField[]): number => {
  const primaryLabels = [
    '딜',
    '영업기회',
    '회사',
    '구분',
    'Stage',
    '단계',
    '상태',
    'Close',
    '연락처',
    '주요 연락처',
  ];

  const foundIndex = fields.findIndex((field) =>
    primaryLabels.some(
      (label) => field.label.toLowerCase() === label.toLowerCase(),
    ),
  );

  return foundIndex >= 0 ? foundIndex : 0;
};

const buildPrimaryTitle = (
  primaryField: LabeledField,
  fields: LabeledField[],
): string => {
  const priority = findFieldValue(fields, '우선');

  if (priority && ['딜', '영업기회'].includes(primaryField.label)) {
    return `${priority}. ${primaryField.value}`;
  }

  const closeDate = findFieldValue(fields, 'Close');

  if (closeDate && primaryField.label !== 'Close') {
    return `${primaryField.value} (${closeDate})`;
  }

  return primaryField.value;
};

const shouldHideDetailField = (
  field: LabeledField,
  fields: LabeledField[],
): boolean =>
  field.label === '우선' &&
  fields.some((candidateField) =>
    ['딜', '영업기회'].includes(candidateField.label),
  );

const findFieldValue = (
  fields: LabeledField[],
  label: string,
): string | undefined =>
  fields.find((field) => field.label.toLowerCase() === label.toLowerCase())
    ?.value;

const groupDetailFields = (fields: LabeledField[]): string[] => {
  const compactLabels = new Set([
    '건수',
    '금액',
    'Stage',
    'Stage / Health',
    '단계',
    '상태',
    'Forecast',
    'Health',
  ]);
  const lines: string[] = [];
  let compactFields: LabeledField[] = [];

  const flushCompactFields = () => {
    if (compactFields.length === 0) {
      return;
    }

    lines.push(buildInlineFieldLine(compactFields));
    compactFields = [];
  };

  for (const field of fields) {
    const nextCompactLine = buildInlineFieldLine([...compactFields, field]);

    if (compactLabels.has(field.label) && nextCompactLine.length <= 96) {
      compactFields.push(field);
      continue;
    }

    flushCompactFields();
    lines.push(`${field.label}: ${field.value}`);
  }

  flushCompactFields();

  return lines;
};

const buildInlineFieldLine = (fields: LabeledField[]): string =>
  fields.map((field) => `${field.label}: ${field.value}`).join(' · ');

const normalizeSlackSectionSpacing = (value: string): string => {
  const lines = value.split('\n');
  const formattedLines: string[] = [];
  let isInsideCodeFence = false;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (line.trimStart().startsWith('```')) {
      isInsideCodeFence = !isInsideCodeFence;
      formattedLines.push(line);
      continue;
    }

    if (!isInsideCodeFence && isSlackSectionHeading(line)) {
      if (
        formattedLines.length > 0 &&
        formattedLines[formattedLines.length - 1] !== ''
      ) {
        formattedLines.push('');
      }

      formattedLines.push(line);
      formattedLines.push('');
      continue;
    }

    formattedLines.push(line);
  }

  return collapseExcessBlankLines(formattedLines).join('\n').trim();
};

const isSlackSectionHeading = (line: string): boolean => {
  const trimmedLine = line.trim();

  return /^\*[^*\n]{1,80}\*:?\s*$/.test(trimmedLine);
};

const collapseExcessBlankLines = (lines: string[]): string[] => {
  const collapsedLines: string[] = [];

  for (const line of lines) {
    const previousLine = collapsedLines[collapsedLines.length - 1];
    const lineBeforePrevious = collapsedLines[collapsedLines.length - 2];

    if (line === '' && previousLine === '' && lineBeforePrevious === '') {
      continue;
    }

    collapsedLines.push(line);
  }

  return collapsedLines;
};

const convertMarkdownToSlackMrkdwn = (value: string): string => {
  const lines = value.split('\n');
  let isInsideCodeFence = false;

  return lines
    .map((line) => {
      if (line.trimStart().startsWith('```')) {
        isInsideCodeFence = !isInsideCodeFence;
        return line;
      }

      if (isInsideCodeFence) {
        return line;
      }

      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

      if (headingMatch) {
        return `*${convertInlineMarkdownToSlack(headingMatch[2] ?? '')}*`;
      }

      return convertInlineMarkdownToSlack(line);
    })
    .join('\n');
};

const convertInlineMarkdownToSlack = (value: string): string =>
  value
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, '<$2|$1>')
    .replace(/\*\*([^*\n]+)\*\*/g, '*$1*')
    .replace(/__([^_\n]+)__/g, '*$1*');

const normalizeKoreanWonAmountCell = (
  value: string,
  header: string,
): string => {
  if (!isMoneyHeader(header)) {
    return value;
  }

  return normalizeKoreanWonAmountsInLine(value, {
    forceMoneyContext: true,
    hasKoreanOutput: true,
  });
};

const normalizeKoreanWonAmountsInText = (value: string): string => {
  if (!HANGUL_PATTERN.test(value)) {
    return value;
  }

  const lines = value.split('\n');
  let isInsideCodeFence = false;

  return lines
    .map((line) => {
      if (line.trimStart().startsWith('```')) {
        isInsideCodeFence = !isInsideCodeFence;
        return line;
      }

      if (isInsideCodeFence) {
        return line;
      }

      return normalizeKoreanWonAmountsInLine(line, {
        forceMoneyContext: false,
        hasKoreanOutput: true,
      });
    })
    .join('\n');
};

const normalizeKoreanWonAmountsInLine = (
  line: string,
  options: { forceMoneyContext: boolean; hasKoreanOutput: boolean },
): string => {
  if (!options.hasKoreanOutput) {
    return line;
  }

  return line.replace(
    KOREAN_WON_AMOUNT_PATTERN,
    (
      match,
      prefix: string,
      currencyPrefix: string,
      amount: string,
      wonSuffix: string | undefined,
      offset: number,
    ) => {
      const amountStartIndex = offset + prefix.length + currencyPrefix.length;
      const normalizedWonSuffix = wonSuffix ?? '';
      const hasExplicitCurrency =
        currencyPrefix.trim().length > 0 ||
        normalizedWonSuffix.trim().length > 0;
      const hasMoneyContext =
        options.forceMoneyContext ||
        hasExplicitCurrency ||
        hasMoneyContextNear(line, amountStartIndex, amount.length);

      if (!hasMoneyContext) {
        return match;
      }

      const formattedAmount = formatKoreanWonAmount(amount);

      return formattedAmount ? `${prefix}${formattedAmount}` : match;
    },
  );
};

const hasMoneyContextNear = (
  line: string,
  amountStartIndex: number,
  amountLength: number,
): boolean => {
  const contextStartIndex = Math.max(0, amountStartIndex - 24);
  const contextEndIndex = Math.min(
    line.length,
    amountStartIndex + amountLength + 6,
  );
  const beforeText = line.slice(contextStartIndex, amountStartIndex);
  const afterText = line.slice(amountStartIndex + amountLength, contextEndIndex);

  return (
    MONEY_CONTEXT_PATTERN.test(beforeText) ||
    MONEY_CONTEXT_PATTERN.test(afterText)
  );
};

const formatKoreanWonAmount = (amount: string): string | undefined => {
  const numericAmount = Number(amount.replaceAll(',', ''));

  if (
    !Number.isSafeInteger(numericAmount) ||
    numericAmount < 10_000 ||
    numericAmount > 10_000_000_000_000
  ) {
    return undefined;
  }

  if (numericAmount % 10_000 !== 0) {
    return undefined;
  }

  if (numericAmount >= 100_000_000) {
    return `${formatUnitAmount(numericAmount / 100_000_000)}억`;
  }

  return `${formatUnitAmount(numericAmount / 10_000)}만원`;
};

const formatUnitAmount = (value: number): string =>
  new Intl.NumberFormat('ko-KR', {
    maximumFractionDigits: 4,
  }).format(value);

const isMoneyHeader = (header: string): boolean =>
  MONEY_CONTEXT_PATTERN.test(header);

const moveConfirmationSectionsToBottom = (value: string): string => {
  const lines = value.split('\n');
  const retainedLines: string[] = [];
  const confirmationSections: string[][] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? '';

    if (!isConfirmationSectionHeading(line)) {
      retainedLines.push(line);
      continue;
    }

    const confirmationSection: string[] = [line];
    lineIndex += 1;

    while (lineIndex < lines.length) {
      const candidateLine = lines[lineIndex] ?? '';

      if (
        isSectionBoundary(candidateLine) &&
        !isConfirmationSectionHeading(candidateLine)
      ) {
        lineIndex -= 1;
        break;
      }

      confirmationSection.push(candidateLine);
      lineIndex += 1;
    }

    confirmationSections.push(trimBlankEdges(confirmationSection));
  }

  if (confirmationSections.length === 0) {
    return value;
  }

  return [
    trimBlankEdges(retainedLines).join('\n'),
    ...confirmationSections.map((section) => section.join('\n')),
  ]
    .filter((section) => section.trim().length > 0)
    .join('\n\n');
};

const isSectionBoundary = (line: string): boolean => {
  const trimmedLine = line.trim();

  if (trimmedLine.length === 0) {
    return false;
  }

  return (
    /^#{1,6}\s+/.test(trimmedLine) ||
    /^\*[^*\n]{1,80}\*:?\s*$/.test(trimmedLine) ||
    /^\d+[.)]\s+[^:：\n]{1,80}[:：]?\s*$/.test(trimmedLine) ||
    /^[^:：\n]{2,80}[:：]\s*$/.test(trimmedLine)
  );
};

const isConfirmationSectionHeading = (line: string): boolean => {
  const normalizedLine = line
    .trim()
    .replace(/^#{1,6}\s+/, '')
    .replace(/^(?:[-+*]|\d+[.)])\s+/, '')
    .replace(/^[*_`]+/, '')
    .replace(/[*_`]+$/, '')
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .trim();

  return /^확인\s*필요(?:$|[:：\s*])/.test(normalizedLine);
};

const trimBlankEdges = (lines: string[]): string[] => {
  let startIndex = 0;
  let endIndex = lines.length;

  while (startIndex < endIndex && lines[startIndex]?.trim().length === 0) {
    startIndex += 1;
  }

  while (endIndex > startIndex && lines[endIndex - 1]?.trim().length === 0) {
    endIndex -= 1;
  }

  return lines.slice(startIndex, endIndex);
};
