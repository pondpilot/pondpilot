import { showError, showSuccess } from '@components/app-notifications';
import { notifications } from '@mantine/notifications';
import { RefObject, useCallback, useState } from 'react';

interface ChartExportState {
  isCopying: boolean;
  isExporting: boolean;
}

/**
 * Converts chart SVG to a PNG blob.
 * Uses SVG serialization for fast, high-quality output.
 */
async function chartToPngBlob(chartRef: RefObject<HTMLDivElement | null>): Promise<Blob | null> {
  if (!chartRef.current) return null;

  const svgElement = chartRef.current.querySelector('svg');
  if (!svgElement) {
    console.error('No SVG element found in chart');
    return null;
  }

  // Clone SVG to avoid modifying the original
  const clonedSvg = svgElement.cloneNode(true) as SVGSVGElement;

  // Get computed styles
  const computedStyle = window.getComputedStyle(svgElement);
  const bgColor = computedStyle.backgroundColor || '#ffffff';

  // Get dimensions (2x for retina)
  const svgRect = svgElement.getBoundingClientRect();
  const width = svgRect.width * 2;
  const height = svgRect.height * 2;

  // Set explicit dimensions on the cloned SVG
  clonedSvg.setAttribute('width', String(width));
  clonedSvg.setAttribute('height', String(height));
  clonedSvg.setAttribute('viewBox', `0 0 ${svgRect.width} ${svgRect.height}`);

  // Serialize SVG to string
  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(clonedSvg);

  // Create a blob URL for the SVG
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    // Load SVG into an image
    const img = new Image();
    img.width = width;
    img.height = height;

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load SVG as image'));
      img.src = svgUrl;
    });

    // Create offscreen canvas and draw the image
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }

    // Fill background
    ctx.fillStyle = bgColor === 'rgba(0, 0, 0, 0)' ? '#ffffff' : bgColor;
    ctx.fillRect(0, 0, width, height);

    // Draw the SVG image
    ctx.drawImage(img, 0, 0, width, height);

    // Convert to PNG blob
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/png');
    });
    return blob;
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

export const useChartExport = (
  chartRef: RefObject<HTMLDivElement | null>,
  fileName: string = 'chart',
) => {
  const [state, setState] = useState<ChartExportState>({
    isCopying: false,
    isExporting: false,
  });

  const copyChartToClipboard = useCallback(async () => {
    if (!chartRef.current || state.isCopying) return;

    setState((prev) => ({ ...prev, isCopying: true }));

    const notificationId = showSuccess({
      title: 'Copying chart to clipboard...',
      message: '',
      loading: true,
      autoClose: false,
      color: 'text-accent',
    });

    try {
      // Yield to let the UI update
      await new Promise((resolve) => requestAnimationFrame(resolve));

      const blob = await chartToPngBlob(chartRef);
      if (!blob) {
        throw new Error('Failed to create chart image');
      }

      // Copy to clipboard using the Clipboard API
      await navigator.clipboard.write([
        new ClipboardItem({
          'image/png': blob,
        }),
      ]);

      notifications.update({
        id: notificationId,
        title: 'Chart copied to clipboard',
        message: '',
        loading: false,
        autoClose: 1500,
      });
    } catch (error) {
      notifications.hide(notificationId);
      const message = error instanceof Error ? error.message : 'Unknown error';

      showError({
        title: 'Failed to copy chart to clipboard',
        message,
        autoClose: 5000,
      });
    } finally {
      setState((prev) => ({ ...prev, isCopying: false }));
    }
  }, [chartRef, state.isCopying]);

  const exportChartToPng = useCallback(async () => {
    if (!chartRef.current || state.isExporting) return;

    setState((prev) => ({ ...prev, isExporting: true }));

    const notificationId = showSuccess({
      title: 'Exporting chart to PNG...',
      message: '',
      loading: true,
      autoClose: false,
      color: 'text-accent',
    });

    try {
      // Yield to let the UI update
      await new Promise((resolve) => requestAnimationFrame(resolve));

      const blob = await chartToPngBlob(chartRef);
      if (!blob) {
        throw new Error('Failed to create chart image');
      }

      // Create download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `${fileName}.png`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);

      notifications.update({
        id: notificationId,
        title: `${fileName}.png exported successfully`,
        message: '',
        loading: false,
        autoClose: 1500,
      });
    } catch (error) {
      notifications.hide(notificationId);
      const message = error instanceof Error ? error.message : 'Unknown error';

      showError({
        title: 'Failed to export chart',
        message,
        autoClose: 5000,
      });
    } finally {
      setState((prev) => ({ ...prev, isExporting: false }));
    }
  }, [chartRef, fileName, state.isExporting]);

  return {
    copyChartToClipboard,
    exportChartToPng,
    isCopying: state.isCopying,
    isExporting: state.isExporting,
  };
};
