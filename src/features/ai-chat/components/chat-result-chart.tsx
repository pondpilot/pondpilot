import { showSuccess, showError } from '@components/app-notifications';
import { Box, Text, ActionIcon, Tooltip, Menu, Group, useMantineColorScheme } from '@mantine/core';
import { QueryResults } from '@models/ai-chat';
import { IconDownload, IconCopy, IconPhoto } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { VegaLite } from 'react-vega';

interface ChatResultChartProps {
  results: QueryResults;
  spec: any;
}

export const ChatResultChart = ({ results, spec }: ChatResultChartProps) => {
  const { colorScheme } = useMantineColorScheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 400 });

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const { width } = containerRef.current.getBoundingClientRect();
        // Set height based on aspect ratio or chart type
        const height = spec.height || Math.min(400, width * 0.6);
        setDimensions({ width: width - 40, height });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, [spec.height]);

  // Prepare spec with data and theme
  const enhancedSpec = {
    ...spec,
    width: spec.width || dimensions.width,
    height: spec.height || dimensions.height,
    data: spec.data || { values: results.rows.map((row, i) => {
      const obj: any = {};
      results.columns.forEach((col, j) => {
        obj[col] = row[j];
      });
      return obj;
    })},
    config: {
      ...spec.config,
      background: 'transparent',
      axis: {
        labelColor: colorScheme === 'dark' ? '#e1e1e1' : '#333',
        titleColor: colorScheme === 'dark' ? '#e1e1e1' : '#333',
        gridColor: colorScheme === 'dark' ? '#444' : '#ddd',
        domainColor: colorScheme === 'dark' ? '#666' : '#999',
      },
      legend: {
        labelColor: colorScheme === 'dark' ? '#e1e1e1' : '#333',
        titleColor: colorScheme === 'dark' ? '#e1e1e1' : '#333',
      },
      title: {
        color: colorScheme === 'dark' ? '#e1e1e1' : '#333',
      },
    },
  };

  const handleExportPNG = async () => {
    try {
      // Access the Vega view through the component
      const vegaElement = containerRef.current?.querySelector('.vega-embed');
      if (!vegaElement) {
        showError({ title: 'Failed to export chart', message: 'Chart not found' });
        return;
      }

      // Get the canvas element
      const canvas = vegaElement.querySelector('canvas');
      if (!canvas) {
        showError({ title: 'Failed to export chart', message: 'Canvas not found' });
        return;
      }

      // Convert to blob and download
      canvas.toBlob((blob) => {
        if (!blob) {
          showError({ title: 'Failed to export chart', message: 'Could not create image' });
          return;
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `chart-${new Date().toISOString()}.png`;
        a.click();
        URL.revokeObjectURL(url);
        showSuccess({ title: 'Chart exported as PNG', message: '' });
      });
    } catch (error) {
      showError({ title: 'Failed to export chart', message: '' });
    }
  };

  const handleExportSVG = () => {
    try {
      // Access the SVG element
      const svgElement = containerRef.current?.querySelector('svg');
      if (!svgElement) {
        showError({ title: 'Failed to export chart', message: 'SVG not found' });
        return;
      }

      // Clone and prepare SVG
      const svgClone = svgElement.cloneNode(true) as SVGElement;
      const svgString = new XMLSerializer().serializeToString(svgClone);
      
      // Create blob and download
      const blob = new Blob([svgString], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chart-${new Date().toISOString()}.svg`;
      a.click();
      URL.revokeObjectURL(url);
      showSuccess({ title: 'Chart exported as SVG', message: '' });
    } catch (error) {
      showError({ title: 'Failed to export chart', message: '' });
    }
  };

  const handleCopySpec = () => {
    navigator.clipboard.writeText(JSON.stringify(enhancedSpec, null, 2));
    showSuccess({ title: 'Chart specification copied', message: '' });
  };

  if (results.rows.length === 0) {
    return (
      <Box className="text-center py-8 text-textSecondary-light dark:text-textSecondary-dark">
        <Text size="sm">No data to visualize</Text>
      </Box>
    );
  }

  return (
    <div className="relative" ref={containerRef}>
      {/* Export menu */}
      <Box className="absolute -top-10 right-0 z-10">
        <Group gap="xs">
          <Menu position="bottom-end" withArrow shadow="md">
            <Menu.Target>
              <Tooltip label="Export chart">
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  className="hover:bg-transparent008-light dark:hover:bg-transparent008-dark"
                >
                  <IconDownload size={14} />
                </ActionIcon>
              </Tooltip>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<IconPhoto size={14} />}
                onClick={handleExportPNG}
              >
                Export as PNG
              </Menu.Item>
              <Menu.Item
                leftSection={<IconPhoto size={14} />}
                onClick={handleExportSVG}
              >
                Export as SVG
              </Menu.Item>
              <Menu.Item
                leftSection={<IconCopy size={14} />}
                onClick={handleCopySpec}
              >
                Copy Vega-Lite spec
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Box>

      {/* Chart */}
      <Box 
        className="overflow-hidden rounded-md bg-backgroundPrimary-light dark:bg-backgroundPrimary-dark"
        style={{ minHeight: dimensions.height + 40 }}
      >
        <VegaLite
          spec={enhancedSpec}
          actions={false}
          renderer="canvas"
          className="w-full"
        />
      </Box>

      {results.truncated && (
        <Box className="text-center py-2 border-t border-borderPrimary-light dark:border-borderPrimary-dark">
          <Text size="xs" c="dimmed">
            Visualization based on first {results.rowCount} rows
          </Text>
        </Box>
      )}
    </div>
  );
};