import React, { useState, useEffect, useCallback, memo, useMemo, useRef } from 'react';
import { Button, Dropdown, Space, Divider, Tooltip } from 'antd';
import { MdOutlineMouse } from 'react-icons/md';
import { LuTouchpad } from 'react-icons/lu';
import { LuLayoutDashboard } from 'react-icons/lu';
import { RiFullscreenFill } from 'react-icons/ri';
import { useTranslation } from 'react-i18next';
import { LuZoomIn, LuZoomOut } from 'react-icons/lu';
import { IconDown } from '@refly-packages/ai-workspace-common/components/common/icon';
import { useReactFlow, useOnViewportChange } from '@xyflow/react';
import { useCanvasLayout } from '@refly-packages/ai-workspace-common/hooks/canvas/use-canvas-layout';
import { TFunction } from 'i18next';

interface LayoutControlProps {
  mode: 'mouse' | 'touchpad';
  changeMode: (mode: 'mouse' | 'touchpad') => void;
}

const iconClass = 'flex items-center justify-center';
const buttonClass = '!p-0 h-[30px] w-[30px] flex items-center justify-center ';

// Add interface for TooltipButton props
interface TooltipButtonProps {
  tooltip: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}

// Add interfaces for component props
interface ActionButtonsProps {
  onFitView: () => void;
  onLayout: (direction: 'TB' | 'LR') => void;
  t: TFunction;
}

interface ModeSelectorProps {
  mode: 'mouse' | 'touchpad';
  open: boolean;
  setOpen: (open: boolean) => void;
  items: any[]; // Type this according to your items structure
  onModeChange: (mode: 'mouse' | 'touchpad') => void;
  t: TFunction;
}

interface ZoomControlsProps {
  currentZoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  canZoomIn: boolean;
  canZoomOut: boolean;
  t: TFunction;
}

// Update component definition
const TooltipButton = memo(({ tooltip, children, ...buttonProps }: TooltipButtonProps) => (
  <Tooltip title={tooltip} arrow={false}>
    <Button type="text" {...buttonProps}>
      {children}
    </Button>
  </Tooltip>
));

// Update component definitions
const ActionButtons = memo(({ onFitView, onLayout, t }: ActionButtonsProps) => (
  <>
    <TooltipButton tooltip={t('canvas.toolbar.tooltip.fitView')} onClick={onFitView} className={buttonClass}>
      <RiFullscreenFill className={iconClass} size={16} />
    </TooltipButton>

    <TooltipButton tooltip={t('canvas.toolbar.tooltip.layout')} onClick={() => onLayout('LR')} className={buttonClass}>
      <LuLayoutDashboard className={iconClass} size={16} />
    </TooltipButton>
  </>
));

const ModeSelector = memo(({ mode, open, setOpen, items, onModeChange, t }: ModeSelectorProps) => (
  <Dropdown
    menu={{
      items,
      onClick: ({ key }) => onModeChange(key as 'mouse' | 'touchpad'),
      selectedKeys: [mode],
    }}
    trigger={['click']}
    open={open}
    onOpenChange={setOpen}
  >
    <Tooltip title={t('canvas.toolbar.tooltip.mode')} arrow={false}>
      <Button
        type="text"
        className="!p-0 h-[30px] w-[48px] flex items-center justify-center hover:bg-gray-100 transition-colors duration-200 group"
      >
        {mode === 'mouse' ? <MdOutlineMouse className={iconClass} /> : <LuTouchpad className={iconClass} />}
        <IconDown className={`ml-[-6px] ${iconClass} ${open ? 'rotate-180' : ''}`} />
      </Button>
    </Tooltip>
  </Dropdown>
));
ModeSelector.displayName = 'ModeSelector';

// Create a memoized zoom controls component
const ZoomControls = memo(({ currentZoom, onZoomIn, onZoomOut, canZoomIn, canZoomOut, t }: ZoomControlsProps) => (
  <>
    <TooltipButton
      tooltip={t('canvas.toolbar.tooltip.zoomIn')}
      onClick={onZoomIn}
      disabled={!canZoomIn}
      className={`${buttonClass} ${!canZoomIn ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <LuZoomIn className={iconClass} size={16} />
    </TooltipButton>

    <TooltipButton tooltip={t('canvas.toolbar.tooltip.zoom')} className={`${buttonClass} pointer-events-none mx-1.5`}>
      <div className="text-xs">{Math.round(currentZoom * 100)}%</div>
    </TooltipButton>

    <TooltipButton
      tooltip={t('canvas.toolbar.tooltip.zoomOut')}
      onClick={onZoomOut}
      disabled={!canZoomOut}
      className={`${buttonClass} ${!canZoomOut ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <LuZoomOut className={iconClass} size={16} />
    </TooltipButton>
  </>
));
ZoomControls.displayName = 'ZoomControls';

export const LayoutControl: React.FC<LayoutControlProps> = memo(({ mode, changeMode }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { onLayout } = useCanvasLayout();
  const reactFlowInstance = useReactFlow();
  const [currentZoom, setCurrentZoom] = useState(reactFlowInstance?.getZoom() ?? 1);
  const minZoom = 0.1;
  const maxZoom = 2;

  // Use ref to avoid recreating the timeout on each render
  const timeoutRef = useRef<NodeJS.Timeout>();

  // Optimize viewport change handling
  useOnViewportChange({
    onChange: useCallback(
      ({ zoom }) => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = setTimeout(() => {
          if (Math.abs(zoom - currentZoom) > 0.01) {
            setCurrentZoom(zoom);
          }
        }, 100);
      },
      [currentZoom],
    ),
  });

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleZoomIn = useCallback(() => {
    if (currentZoom < maxZoom) {
      reactFlowInstance?.zoomIn?.();
    }
  }, [currentZoom, reactFlowInstance]);

  const handleZoomOut = useCallback(() => {
    if (currentZoom > minZoom) {
      reactFlowInstance?.zoomOut?.();
    }
  }, [currentZoom, reactFlowInstance]);

  const handleFitView = useCallback(() => {
    reactFlowInstance?.fitView();
  }, [reactFlowInstance]);

  const canZoomIn = currentZoom < maxZoom;
  const canZoomOut = currentZoom > minZoom;

  // Memoize static configurations
  const items = useMemo(
    () => [
      {
        key: 'mouse',
        label: (
          <Space>
            <MdOutlineMouse className={iconClass} />
            {t('canvas.toolbar.mouse')}
          </Space>
        ),
      },
      {
        key: 'touchpad',
        label: (
          <Space>
            <LuTouchpad className={iconClass} />
            {t('canvas.toolbar.touchpad')}
          </Space>
        ),
      },
    ],
    [t],
  );

  return (
    <div className="absolute bottom-2 left-2.5 px-1 h-[32px] border-box flex items-center justify-center bg-white rounded-md shadow-md">
      <ZoomControls
        currentZoom={currentZoom}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        canZoomIn={canZoomIn}
        canZoomOut={canZoomOut}
        t={t}
      />

      <Divider type="vertical" className="h-full" />

      <ActionButtons onFitView={handleFitView} onLayout={onLayout} t={t} />

      <ModeSelector mode={mode} open={open} setOpen={setOpen} items={items} onModeChange={changeMode} t={t} />
    </div>
  );
});

// Add display name for better debugging
LayoutControl.displayName = 'LayoutControl';
