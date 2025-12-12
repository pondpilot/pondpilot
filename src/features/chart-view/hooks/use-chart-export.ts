import { showError, showSuccess } from '@components/app-notifications';
import { notifications } from '@mantine/notifications';
import { RefObject, useCallback, useState } from 'react';

interface ChartExportState {
  isCopying: boolean;
  isExporting: boolean;
}

/**
 * Converts a single SVG element to an image.
 */
async function svgToImage(
  svgElement: SVGSVGElement,
  scale: number = 2,
): Promise<{ img: HTMLImageElement; width: number; height: number }> {
  const clonedSvg = svgElement.cloneNode(true) as SVGSVGElement;
  const svgRect = svgElement.getBoundingClientRect();
  const width = svgRect.width * scale;
  const height = svgRect.height * scale;

  clonedSvg.setAttribute('width', String(width));
  clonedSvg.setAttribute('height', String(height));
  clonedSvg.setAttribute('viewBox', `0 0 ${svgRect.width} ${svgRect.height}`);

  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(clonedSvg);
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const img = new Image();
    img.width = width;
    img.height = height;

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load SVG as image'));
      img.src = svgUrl;
    });

    return { img, width, height };
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

/**
 * Converts chart SVG(s) to a PNG blob.
 * Handles both single charts and small multiples (multiple SVGs stacked vertically).
 * Uses SVG serialization for fast, high-quality output.
 */
async function chartToPngBlob(chartRef: RefObject<HTMLDivElement | null>): Promise<Blob | null> {
  if (!chartRef.current) return null;

  const svgElements = chartRef.current.querySelectorAll('svg');
  if (svgElements.length === 0) {
    console.error('No SVG element found in chart');
    return null;
  }

  // Get background color from container
  const computedStyle = window.getComputedStyle(chartRef.current);
  const bgColor = computedStyle.backgroundColor || '#ffffff';

  const scale = 2; // Retina scaling

  // For single SVG, use simpler path
  if (svgElements.length === 1) {
    const { img, width, height } = await svgToImage(svgElements[0], scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get canvas context');

    ctx.fillStyle = bgColor === 'rgba(0, 0, 0, 0)' ? '#ffffff' : bgColor;
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    return new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/png');
    });
  }

  // For multiple SVGs (small multiples), combine them vertically
  const containerRect = chartRef.current.getBoundingClientRect();
  const totalWidth = containerRect.width * scale;
  const totalHeight = containerRect.height * scale;

  const canvas = document.createElement('canvas');
  canvas.width = totalWidth;
  canvas.height = totalHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas context');

  // Fill background
  ctx.fillStyle = bgColor === 'rgba(0, 0, 0, 0)' ? '#ffffff' : bgColor;
  ctx.fillRect(0, 0, totalWidth, totalHeight);

  // Draw each SVG at its relative position within the container
  for (const svgElement of svgElements) {
    const { img, width, height } = await svgToImage(svgElement, scale);
    const svgRect = svgElement.getBoundingClientRect();

    // Calculate position relative to container
    const x = (svgRect.left - containerRect.left) * scale;
    const y = (svgRect.top - containerRect.top) * scale;

    ctx.drawImage(img, x, y, width, height);
  }

  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/png');
  });
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
