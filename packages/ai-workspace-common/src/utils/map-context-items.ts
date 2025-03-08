import { ActionResult, CanvasNodeType, SkillContext } from '@refly/openapi-schema';
import { Node, Edge } from '@xyflow/react';
import { IContextItem } from '@refly-packages/ai-workspace-common/stores/context-panel';
import { getClientOrigin } from '@refly-packages/utils/url';
import { CanvasNodeFilter } from '@refly-packages/ai-workspace-common/hooks/canvas/use-node-selection';
import { omit } from '@refly/utils';

export const convertResultContextToItems = (
  context: SkillContext,
  history: ActionResult[],
): IContextItem[] => {
  if (!context) return [];

  const items: IContextItem[] = [];

  for (const item of history ?? []) {
    items.push({
      type: 'skillResponse',
      entityId: item.resultId,
      title: item.title,
    });
  }

  // Convert contentList
  for (const content of context?.contentList ?? []) {
    const metadata = content.metadata as any;
    items.push({
      type: metadata?.domain?.includes('resource')
        ? 'resource'
        : metadata?.domain?.includes('document')
          ? 'document'
          : 'skillResponse',
      entityId: metadata?.entityId ?? '',
      title: metadata?.title ?? 'Selected Content',
      metadata: {
        contentPreview: content.content,
        selectedContent: content.content,
        sourceEntityId: metadata?.entityId ?? '',
        sourceEntityType: metadata?.domain?.split('Selection')[0] ?? '',
        sourceType: metadata?.domain ?? '',
        ...(metadata?.url && { url: metadata.url }),
      },
    });
  }

  // Convert resources
  for (const resource of context?.resources ?? []) {
    items.push({
      type: 'resource',
      entityId: resource.resourceId ?? '',
      title: resource.resource?.title ?? 'Resource',
      metadata: resource.metadata ?? {},
      isPreview: !!resource.isCurrent,
      isCurrentContext: resource.isCurrent,
    });
  }

  // Convert documents
  for (const doc of context?.documents ?? []) {
    items.push({
      type: 'document',
      entityId: doc.docId ?? '',
      title: doc.document?.title ?? 'Document',
      metadata: doc.metadata ?? {},
      isPreview: !!doc.isCurrent,
      isCurrentContext: doc.isCurrent,
    });
  }

  return purgeContextItems(items);
};

export const convertContextItemsToNodeFilters = (items: IContextItem[]): CanvasNodeFilter[] => {
  const uniqueItems = new Map<string, CanvasNodeFilter>();

  for (const item of items ?? []) {
    const type = item.selection?.sourceEntityType ?? (item.type as CanvasNodeType);
    const entityId = item.selection?.sourceEntityId ?? item.entityId;

    const key = `${type}-${entityId}`;
    if (!uniqueItems.has(key)) {
      uniqueItems.set(key, { type, entityId });
    }
  }

  return Array.from(uniqueItems.values());
};

export const convertContextItemsToInvokeParams = (
  items: IContextItem[],
  getHistory: (item: IContextItem) => ActionResult[],
  getMemo?: (item: IContextItem) => { content: string; title: string }[],
  getCodeArtifact?: (item: IContextItem) => { content: string; title: string }[],
  getImages?: (
    item: IContextItem,
  ) => { storageKey: string; title: string; entityId: string; metadata: any }[],
  getWebsite?: (item: IContextItem) => { url: string; title: string }[],
): { context: SkillContext; resultHistory: ActionResult[]; images: string[] } => {
  const purgedItems = purgeContextItems(items);
  const context = {
    contentList: [
      ...(purgedItems
        ?.filter((item) => item.selection)
        ?.map((item) => ({
          content: item.selection?.content ?? '',
          metadata: {
            domain: item.selection?.sourceEntityType ?? '',
            entityId: item.selection?.sourceEntityId ?? '',
            title: item.selection?.sourceTitle ?? '',
            ...(item.metadata?.sourceType === 'extensionWeblinkSelection' && {
              url: item.metadata?.url || getClientOrigin(),
            }),
          },
        })) ?? []),
      ...(purgedItems
        ?.filter((item) => item.type === 'memo' && getMemo)
        ?.flatMap((item) =>
          getMemo(item).map((memo) => ({
            content: memo.content,
            metadata: {
              domain: 'memo',
              entityId: item.entityId,
              title: memo.title,
            },
          })),
        ) ?? []),
      ...(purgedItems
        ?.filter((item) => item.type === 'codeArtifact' && getCodeArtifact)
        ?.flatMap((item) =>
          getCodeArtifact(item).map((code) => ({
            content: code.content,
            metadata: {
              domain: 'codeArtifact',
              entityId: item.entityId,
              title: code.title,
            },
          })),
        ) ?? []),
    ],
    resources: purgedItems
      ?.filter((item) => item?.type === 'resource')
      .map((item) => ({
        resourceId: item.entityId,
        resource: {
          resourceId: item.entityId,
          resourceType: item.metadata?.resourceType,
          title: item.title,
        },
        isCurrent: item.isCurrentContext,
        metadata: {
          ...item.metadata,
        },
      })),
    documents: purgedItems
      ?.filter((item) => item?.type === 'document')
      .map((item) => ({
        docId: item.entityId,
        document: {
          docId: item.entityId,
          title: item.title,
        },
        isCurrent: item.isCurrentContext,
        metadata: {
          ...item.metadata,
          url: getClientOrigin(),
        },
      })),
    urls: purgedItems
      ?.filter((item) => item?.type === 'website')
      .flatMap((item) => {
        if (getWebsite) {
          return getWebsite(item).map((site) => ({
            url: site.url || '',
            metadata: {
              title: site.title,
              ...item.metadata,
            },
          }));
        }

        return [
          {
            url: item.metadata?.url || '',
            metadata: {
              title: item.title,
              ...item.metadata,
            },
          },
        ];
      }),
  };
  const resultHistory = purgedItems
    ?.filter((item) => item.type === 'skillResponse')
    .flatMap((item) => {
      return item.metadata?.withHistory
        ? getHistory(item)
        : [{ title: item.title, resultId: item.entityId }];
    });
  const images = purgedItems
    ?.filter((item) => item.type === 'image')
    .flatMap((item) => {
      if (getImages) {
        return getImages(item)
          .map((img) => img.storageKey)
          .filter(Boolean);
      }
      // Fallback to existing behavior if getImages is not provided
      return item.metadata?.storageKey ? [item.metadata.storageKey] : [];
    });

  return { context, resultHistory, images };
};

export const convertContextItemsToEdges = (
  resultId: string,
  items: IContextItem[],
  nodes?: Node[],
  edges?: Edge[],
): { edgesToAdd: Edge[]; edgesToDelete: Edge[] } => {
  // Initialize arrays for new edges and edges to be deleted
  const edgesToAdd: Edge[] = [];
  const edgesToDelete: Edge[] = [];

  // Return early if no items to process
  if (!items?.length) {
    return { edgesToAdd, edgesToDelete };
  }

  const currentNode = nodes.find((node) => node.data?.entityId === resultId);
  if (!currentNode) {
    console.warn('currentNode not found');
    return { edgesToAdd, edgesToDelete };
  }

  const relatedEdges = edges.filter((edge) => edge.target === currentNode.id) ?? [];

  // Create a map of source entity IDs to their corresponding node IDs
  const entityNodeMap = new Map<string, string>();
  for (const node of nodes ?? []) {
    if (node.data?.entityId) {
      entityNodeMap.set(node.data.entityId as string, node.id);
    }
  }

  const itemNodeIds = items.map((item) => entityNodeMap.get(item.entityId as string));
  const itemNodeIdSet = new Set(itemNodeIds);

  const edgeSourceIds = relatedEdges.map((edge) => edge.source);
  const edgeSourceIdSet = new Set(edgeSourceIds);

  // Process each item to create edges based on relationships
  for (const item of items ?? []) {
    const itemNodeId = entityNodeMap.get(item.entityId as string);
    if (!edgeSourceIdSet.has(itemNodeId)) {
      const newEdge: Edge = {
        id: `${itemNodeId}-${currentNode.id}`,
        source: itemNodeId,
        target: currentNode.id,
      };
      edgesToAdd.push(newEdge);
    }
  }

  // Delete edges that are no longer part of the context items
  for (const edge of relatedEdges ?? []) {
    if (!itemNodeIdSet.has(edge.source)) {
      edgesToDelete.push(edge);
    }
  }

  return {
    edgesToAdd,
    edgesToDelete,
  };
};

/**
 * Purge the metadata from the context items
 * @param items
 * @returns purged context items
 */
export const purgeContextItems = (items: IContextItem[]): IContextItem[] => {
  if (!Array.isArray(items)) {
    return [];
  }
  return items.map((item) => ({
    ...omit(item, ['metadata']),
    metadata: {
      withHistory: item.metadata?.withHistory,
    },
  }));
};
