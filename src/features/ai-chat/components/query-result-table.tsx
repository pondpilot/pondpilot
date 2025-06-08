import { Table, ScrollArea, Text } from '@mantine/core';
import { QueryResults } from '@models/ai-chat';

interface QueryResultTableProps {
  results: QueryResults;
}

export const QueryResultTable = ({ results }: QueryResultTableProps) => {
  if (results.rows.length === 0) {
    return (
      <div className="text-center py-4 text-gray-500">
        No results returned
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <ScrollArea>
        <Table striped highlightOnHover withTableBorder data-testid="ai-chat-query-result">
          <thead>
            <tr>
              {results.columns.map((column, index) => (
                <th key={index}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {results.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex}>
                    {cell === null ? (
                      <Text c="dimmed" size="sm" fs="italic">NULL</Text>
                    ) : typeof cell === 'object' ? (
                      <Text size="sm">{JSON.stringify(cell)}</Text>
                    ) : (
                      <Text size="sm">{String(cell)}</Text>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </Table>
      </ScrollArea>

      {results.truncated && (
        <Text size="xs" c="dimmed" ta="center">
          Results truncated to {results.rowCount} rows
        </Text>
      )}
    </div>
  );
};
