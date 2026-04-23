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

  return moveConfirmationSectionsToBottom(withKoreanMoneyUnits);
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

        return `*${formattedHeader}*: ${formattedCell}`;
      })
      .filter((cell): cell is string => cell !== undefined);

    return `• ${formattedCells.join(' · ')}`;
  });

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
