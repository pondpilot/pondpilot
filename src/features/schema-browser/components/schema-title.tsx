import { SchemaBrowserTab } from '@models/tab';
import { useAppStore } from '@store/app-store';
import { getSchemaBrowserDisplayTitle } from '@utils/tab-titles';

interface SchemaTitleProps {
  tab: Omit<SchemaBrowserTab, 'dataViewStateCache'>;
  nodeCount: number;
}

export const SchemaTitle = ({ tab, nodeCount }: SchemaTitleProps) => {
  const { dataSources, localEntries } = useAppStore();

  const { prefix, title } = getSchemaBrowserDisplayTitle(tab, dataSources, localEntries);

  return (
    <>
      <h3 className="text-sm font-medium mb-1">
        {prefix && (
          <>
            {prefix} {title}
          </>
        )}
        {!prefix && title}
      </h3>
      <div className="text-xs text-slate-500">
        {nodeCount} {nodeCount === 1 ? 'table' : 'tables'}
      </div>
    </>
  );
};
