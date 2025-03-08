import { memo, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Position, useReactFlow } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { CanvasNode, CanvasNodeData, WebsiteNodeMeta, WebsiteNodeProps } from './shared/types';
import { CustomHandle } from './shared/custom-handle';
import { getNodeCommonStyles } from './index';
import { useAddToContext } from '@refly-packages/ai-workspace-common/hooks/canvas/use-add-to-context';
import { useDeleteNode } from '@refly-packages/ai-workspace-common/hooks/canvas/use-delete-node';
import classNames from 'classnames';
import { useNodeHoverEffect } from '@refly-packages/ai-workspace-common/hooks/canvas/use-node-hover';
import { FiCode, FiEye, FiExternalLink, FiCopy } from 'react-icons/fi';
import { Button, Form, Input, message, Tooltip } from 'antd';
import { IconWebsite } from '@refly-packages/ai-workspace-common/components/common/icon';
import { ActionButtons } from './shared/action-buttons';
import {
  nodeActionEmitter,
  createNodeEventName,
  cleanupNodeEvents,
} from '@refly-packages/ai-workspace-common/events/nodeActions';
import { useSetNodeDataByEntity } from '@refly-packages/ai-workspace-common/hooks/canvas/use-set-node-data-by-entity';
import { NodeHeader } from './shared/node-header';
import { useEditorPerformance } from '@refly-packages/ai-workspace-common/context/editor-performance';
import { useCanvasStoreShallow } from '@refly-packages/ai-workspace-common/stores/canvas';
import { useCanvasContext } from '@refly-packages/ai-workspace-common/context/canvas';
import { useNodeSize } from '@refly-packages/ai-workspace-common/hooks/canvas/use-node-size';
import { NodeResizer as NodeResizerComponent } from './shared/node-resizer';
import { IContextItem } from '@refly-packages/ai-workspace-common/stores/context-panel';
import { genSkillID } from '@refly-packages/utils/id';
import { useAddNode } from '@refly-packages/ai-workspace-common/hooks/canvas/use-add-node';

const DEFAULT_WIDTH = 580;
const DEFAULT_HEIGHT = 400;

/**
 * Website node content component that displays either a form for URL input or an iframe preview
 */
const NodeContent = memo(
  ({ data, readonly }: { data: CanvasNodeData<WebsiteNodeMeta>; readonly: boolean }) => {
    const { url = '', viewMode = 'form' } = data?.metadata ?? {};
    const [isEditing, setIsEditing] = useState(viewMode === 'form' || !url);
    const { t } = useTranslation();
    const setNodeDataByEntity = useSetNodeDataByEntity();
    const formRef = useRef<any>(null);

    // Update editing state when metadata changes
    useEffect(() => {
      const shouldBeEditing = data?.metadata?.viewMode === 'form' || !data?.metadata?.url;
      if (isEditing !== shouldBeEditing) {
        setIsEditing(shouldBeEditing);
      }
    }, [data?.metadata?.url, data?.metadata?.viewMode, isEditing]);

    // Initialize form with current URL when entering edit mode
    useEffect(() => {
      if (isEditing && formRef.current && url) {
        formRef.current.setFieldsValue({ url });
      }
    }, [isEditing, url]);

    // Handle form submission to save URL
    const handleSubmit = useCallback(
      (values: { url: string }) => {
        if (!values?.url) {
          message.error(t('canvas.nodes.website.urlRequired', 'URL is required'));
          return;
        }

        // Add https:// if missing
        let formattedUrl = values.url;
        if (!/^https?:\/\//i.test(formattedUrl)) {
          formattedUrl = `https://${formattedUrl}`;
        }

        setNodeDataByEntity(
          {
            type: 'website',
            entityId: data.entityId,
          },
          {
            metadata: {
              ...data.metadata,
              url: formattedUrl,
              viewMode: 'preview',
            },
          },
        );
        setIsEditing(false);
      },
      [data.entityId, data.metadata, setNodeDataByEntity, t],
    );

    // Toggle between form and preview modes
    const toggleMode = useCallback(
      (event: React.MouseEvent) => {
        event.stopPropagation();
        setIsEditing((prev) => !prev);
        setNodeDataByEntity(
          {
            type: 'website',
            entityId: data.entityId,
          },
          {
            metadata: {
              ...data.metadata,
              viewMode: isEditing ? 'preview' : 'form',
            },
          },
        );
      },
      [data.entityId, data.metadata, isEditing, setNodeDataByEntity],
    );

    // Open website in a new tab
    const handleOpenInNewTab = useCallback(
      (event: React.MouseEvent) => {
        event.stopPropagation();
        if (url) {
          window.open(url, '_blank', 'noopener,noreferrer');
        }
      },
      [url],
    );

    // Handle copy URL to clipboard
    const handleCopyUrl = useCallback(
      async (event: React.MouseEvent) => {
        event.stopPropagation();
        if (url) {
          try {
            await navigator.clipboard.writeText(url);
            message.success(t('canvas.nodes.website.urlCopied', 'URL copied to clipboard'));
          } catch (err: any) {
            console.error(err);
            message.error(t('canvas.nodes.website.copyFailed', 'Failed to copy URL'));
          }
        }
      },
      [url, t],
    );

    // If no URL or in form mode, show the form
    if (isEditing) {
      return (
        <div className="p-4 w-full h-full flex flex-col">
          <div className="flex justify-between mb-4">
            <div className="text-lg font-medium">
              {t('canvas.nodes.website.addWebsite', 'Add Website')}
            </div>
            {url && (
              <Button
                type="text"
                icon={<FiEye />}
                onClick={toggleMode}
                className="flex items-center"
              >
                {t('canvas.nodes.website.preview', 'Preview')}
              </Button>
            )}
          </div>
          <Form
            ref={formRef}
            layout="vertical"
            initialValues={{ url }}
            onFinish={handleSubmit}
            className="flex-1"
          >
            <Form.Item
              name="url"
              label={t('canvas.nodes.website.websiteUrl', 'Website URL')}
              rules={[
                {
                  required: true,
                  message: t('canvas.nodes.website.urlRequired', 'Please enter a website URL'),
                },
              ]}
            >
              <Input placeholder="https://example.com" className="w-full" disabled={readonly} />
            </Form.Item>
            <Form.Item className="mt-4">
              <Button type="primary" htmlType="submit" className="w-full" disabled={readonly}>
                {t('canvas.nodes.website.save', 'Save and View Website')}
              </Button>
            </Form.Item>
          </Form>
        </div>
      );
    }

    // Show the website in an iframe
    return (
      <div className="w-full h-full flex flex-col">
        <div className="flex justify-between items-center p-2 border-b border-gray-200">
          <div className="text-sm font-medium truncate flex-1">{url}</div>
          <div className="flex items-center">
            <Tooltip title={t('canvas.nodes.website.copyUrl', 'Copy URL')}>
              <Button type="text" icon={<FiCopy />} onClick={handleCopyUrl} className="mr-1" />
            </Tooltip>
            <Tooltip title={t('canvas.nodes.website.openInNewTab', 'Open in new tab')}>
              <Button
                type="text"
                icon={<FiExternalLink />}
                onClick={handleOpenInNewTab}
                className="mr-1"
              />
            </Tooltip>
            <Button
              type="text"
              icon={<FiCode />}
              onClick={toggleMode}
              className="flex items-center"
              disabled={readonly}
            >
              {t('canvas.nodes.website.edit', 'Edit')}
            </Button>
          </div>
        </div>
      </div>
    );
  },
  (prevProps, nextProps) => {
    const prevUrl = prevProps.data?.metadata?.url;
    const nextUrl = nextProps.data?.metadata?.url;
    const prevViewMode = prevProps.data?.metadata?.viewMode;
    const nextViewMode = nextProps.data?.metadata?.viewMode;
    const prevReadonly = prevProps.readonly;
    const nextReadonly = nextProps.readonly;

    return prevUrl === nextUrl && prevViewMode === nextViewMode && prevReadonly === nextReadonly;
  },
);

NodeContent.displayName = 'NodeContent';

/**
 * Main WebsiteNode component for displaying websites in the canvas
 */
export const WebsiteNode = memo(
  ({
    data,
    id,
    selected,
    isPreview = false,
    hideActions = false,
    hideHandles = false,
    onNodeClick,
  }: WebsiteNodeProps) => {
    const nodeRef = useRef<HTMLDivElement>(null);
    const { t } = useTranslation();
    const [isHovered, setIsHovered] = useState(false);

    const { addToContext } = useAddToContext();
    const { deleteNode } = useDeleteNode();
    const { getNode } = useReactFlow();
    const { addNode } = useAddNode();

    // Hover effect
    const { handleMouseEnter: onHoverStart, handleMouseLeave: onHoverEnd } = useNodeHoverEffect(id);

    const { operatingNodeId } = useCanvasStoreShallow((state) => ({
      operatingNodeId: state.operatingNodeId,
    }));

    const { draggingNodeId } = useEditorPerformance();
    const isOperating = operatingNodeId === id;
    const isDragging = draggingNodeId === id;
    const node = useMemo(() => getNode(id), [id, getNode]);

    const { readonly } = useCanvasContext();

    const { sizeMode = 'adaptive' } = data?.metadata ?? {};

    const { containerStyle, handleResize } = useNodeSize({
      id,
      node,
      sizeMode,
      isOperating,
      minWidth: DEFAULT_WIDTH,
      maxWidth: 1200,
      minHeight: DEFAULT_HEIGHT,
      defaultWidth: DEFAULT_WIDTH,
      defaultHeight: DEFAULT_HEIGHT,
    });

    // Handle mouse events
    const handleMouseEnter = useCallback(() => {
      if (!isHovered) {
        setIsHovered(true);
        onHoverStart();
      }
    }, [isHovered, onHoverStart]);

    const handleMouseLeave = useCallback(() => {
      if (isHovered) {
        setIsHovered(false);
        onHoverEnd();
      }
    }, [isHovered, onHoverEnd]);

    // Handle adding to context
    const handleAddToContext = useCallback(() => {
      addToContext({
        type: 'website',
        title: data.title || t('canvas.nodes.website.defaultTitle', 'Website'),
        entityId: data.entityId,
        metadata: {
          ...data.metadata,
        },
      });
    }, [addToContext, data.metadata, data.title, data.entityId, t]);

    // Handle deletion
    const handleDelete = useCallback(() => {
      if (id) {
        deleteNode({
          id,
          type: 'website',
          data,
          position: { x: 0, y: 0 },
        } as CanvasNode);
      }
    }, [id, data, deleteNode]);

    // Add Ask AI functionality
    const handleAskAI = useCallback(() => {
      const url = data?.metadata?.url;
      if (!url) return;

      addNode(
        {
          type: 'skill',
          data: {
            title: 'Skill',
            entityId: genSkillID(),
            metadata: {
              contextItems: [
                {
                  type: 'website',
                  title: data?.title || t('canvas.nodes.website.defaultTitle', 'Website'),
                  entityId: data.entityId,
                  metadata: data.metadata,
                },
              ] as IContextItem[],
            },
          },
        },
        [{ type: 'website', entityId: data.entityId }],
        false,
        true,
      );
    }, [data, addNode, t]);

    // Add event handling
    useEffect(() => {
      // Create node-specific event handlers
      const handleNodeAddToContext = () => handleAddToContext();
      const handleNodeDelete = () => handleDelete();
      const handleNodeAskAI = () => handleAskAI();

      // Register events with node ID
      nodeActionEmitter.on(createNodeEventName(id, 'addToContext'), handleNodeAddToContext);
      nodeActionEmitter.on(createNodeEventName(id, 'delete'), handleNodeDelete);
      nodeActionEmitter.on(createNodeEventName(id, 'askAI'), handleNodeAskAI);

      return () => {
        // Cleanup events when component unmounts
        nodeActionEmitter.off(createNodeEventName(id, 'addToContext'), handleNodeAddToContext);
        nodeActionEmitter.off(createNodeEventName(id, 'delete'), handleNodeDelete);
        nodeActionEmitter.off(createNodeEventName(id, 'askAI'), handleNodeAskAI);

        // Clean up all node events
        cleanupNodeEvents(id);
      };
    }, [id, handleAddToContext, handleDelete, handleAskAI]);

    return (
      <div className={classNames({ nowheel: isOperating })}>
        <div
          ref={nodeRef}
          className={classNames('relative', {
            'nodrag nopan select-text': isOperating,
          })}
          style={isPreview ? { width: 288, height: 200 } : containerStyle}
          onMouseEnter={!isPreview ? handleMouseEnter : undefined}
          onMouseLeave={!isPreview ? handleMouseLeave : undefined}
          onClick={onNodeClick}
        >
          {!isPreview && !hideActions && !isDragging && !readonly && (
            <ActionButtons type="website" nodeId={id} isNodeHovered={isHovered && selected} />
          )}

          <div
            className={`
              h-full
              flex flex-col
              ${getNodeCommonStyles({ selected: !isPreview && selected, isHovered })}
            `}
          >
            <div className="flex flex-col h-full relative p-3 box-border">
              <NodeHeader
                title={data.title || t('canvas.nodes.website.defaultTitle', 'Website')}
                Icon={IconWebsite}
              />

              <div className="relative flex-grow min-h-0">
                <div className="h-full overflow-y-auto">
                  {data && <NodeContent data={data} readonly={readonly} />}
                </div>
              </div>
            </div>

            {!isPreview && !hideHandles && (
              <>
                <CustomHandle
                  type="target"
                  position={Position.Left}
                  id="target"
                  isConnected={false}
                  isNodeHovered={isHovered}
                  nodeType="website"
                />
                <CustomHandle
                  type="source"
                  position={Position.Right}
                  id="source"
                  isConnected={false}
                  isNodeHovered={isHovered}
                  nodeType="website"
                />
              </>
            )}
          </div>
        </div>

        {!isPreview && selected && sizeMode === 'adaptive' && !readonly && (
          <NodeResizerComponent
            targetRef={nodeRef}
            isSelected={selected}
            isHovered={isHovered}
            isPreview={isPreview}
            sizeMode={sizeMode}
            onResize={handleResize}
          />
        )}
      </div>
    );
  },
);

WebsiteNode.displayName = 'WebsiteNode';
