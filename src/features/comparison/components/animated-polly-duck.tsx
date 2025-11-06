import DuckIcon from '@assets/duck.svg?react';
import { Stack, Text } from '@mantine/core';
import { IconTable } from '@tabler/icons-react';
import { useEffect, useState } from 'react';

type AnimatedPollyDuckProps = {
  size?: number;
  datasetNameA?: string;
  datasetNameB?: string;
};

export const AnimatedPollyDuck = ({
  size = 80,
  datasetNameA = 'Dataset A',
  datasetNameB = 'Dataset B',
}: AnimatedPollyDuckProps) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const tableIconSize = size * 0.6;
  const spacing = size * 1.5;

  return (
    <>
      <style>
        {`
          @keyframes pollyFloat {
            0% {
              transform: translateY(0px) scaleX(1);
            }
            10% {
              transform: translateY(-12px) scaleX(1);
            }
            20% {
              transform: translateY(0px) scaleX(1);
            }
            30% {
              transform: translateY(-12px) scaleX(1);
            }
            40% {
              transform: translateY(0px) scaleX(1);
            }
            50% {
              transform: translateY(0px) scaleX(-1);
            }
            60% {
              transform: translateY(-12px) scaleX(-1);
            }
            70% {
              transform: translateY(0px) scaleX(-1);
            }
            80% {
              transform: translateY(-12px) scaleX(-1);
            }
            90% {
              transform: translateY(0px) scaleX(-1);
            }
            100% {
              transform: translateY(0px) scaleX(1);
            }
          }

          @keyframes flyFromLeft {
            0% {
              transform: translateX(0) translateY(0) scale(1);
              opacity: 0.8;
            }
            50% {
              transform: translateX(${spacing * 0.4}px) translateY(-10px) scale(0.6);
              opacity: 0.6;
            }
            100% {
              transform: translateX(${spacing * 0.8}px) translateY(0) scale(0.3);
              opacity: 0;
            }
          }

          @keyframes flyFromRight {
            0% {
              transform: translateX(0) translateY(0) scale(1);
              opacity: 0.8;
            }
            50% {
              transform: translateX(-${spacing * 0.4}px) translateY(-10px) scale(0.6);
              opacity: 0.6;
            }
            100% {
              transform: translateX(-${spacing * 0.8}px) translateY(0) scale(0.3);
              opacity: 0;
            }
          }

          @keyframes tablePulse {
            0%, 100% {
              opacity: 0.4;
              transform: scale(1);
            }
            50% {
              opacity: 0.7;
              transform: scale(1.05);
            }
          }

          .flying-number {
            position: absolute;
            font-size: 12px;
            font-weight: 600;
            color: #4CAE4F;
            pointer-events: none;
          }
        `}
      </style>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: `${spacing}px`,
          position: 'relative',
          opacity: isVisible ? 1 : 0,
          transition: 'opacity 0.3s ease-in',
        }}
      >
        {/* Left Table Icon */}
        <Stack gap={4} align="center" style={{ minWidth: size * 1.2 }}>
          <div
            style={{
              animation: isVisible ? 'tablePulse 3s ease-in-out infinite' : undefined,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <IconTable size={tableIconSize} stroke={1.5} opacity={0.6} />
          </div>
          <Text size="xs" c="dimmed" fw={500} ta="center" style={{ lineHeight: 1.2 }}>
            {datasetNameA}
          </Text>
        </Stack>

        {/* Flying Numbers/Rows from Left */}
        {isVisible &&
          [0, 1, 2].map((i) => (
            <div
              key={`left-${i.toString()}`}
              className="flying-number"
              style={{
                left: `${spacing * 0.3}px`,
                top: `${15 + i * 8}px`,
                animation: 'flyFromLeft 2s ease-out infinite',
                animationDelay: `${i * 0.6}s`,
              }}
            >
              {['123', '456', '789'][i]}
            </div>
          ))}

        {/* Polly Duck */}
        <div
          style={{
            width: size,
            height: size,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: isVisible ? 'pollyFloat 6s ease-in-out infinite' : undefined,
          }}
        >
          <DuckIcon width={size} height={size} />
        </div>

        {/* Flying Numbers/Rows from Right */}
        {isVisible &&
          [0, 1, 2].map((i) => (
            <div
              key={`right-${i.toString()}`}
              className="flying-number"
              style={{
                right: `${spacing * 0.3}px`,
                top: `${15 + i * 8}px`,
                animation: 'flyFromRight 2s ease-out infinite',
                animationDelay: `${i * 0.6}s`,
              }}
            >
              {['abc', 'def', 'xyz'][i]}
            </div>
          ))}

        {/* Right Table Icon */}
        <Stack gap={4} align="center" style={{ minWidth: size * 1.2 }}>
          <div
            style={{
              animation: isVisible ? 'tablePulse 3s ease-in-out infinite 1.5s' : undefined,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <IconTable size={tableIconSize} stroke={1.5} opacity={0.6} />
          </div>
          <Text size="xs" c="dimmed" fw={500} ta="center" style={{ lineHeight: 1.2 }}>
            {datasetNameB}
          </Text>
        </Stack>
      </div>
    </>
  );
};
