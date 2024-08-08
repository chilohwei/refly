import {
  Button,
  Divider,
  Input,
  List,
  Avatar,
  Checkbox,
  Skeleton,
  Select,
  Message as message,
  Affix,
} from '@arco-design/web-react';
import { IconLink, IconBranch, IconClose, IconPen } from '@arco-design/web-react/icon';
import classNames from 'classnames';
import { useEffect, useState } from 'react';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import cherrio from 'cheerio';

// utils
import { isUrl } from '@refly/utils/isUrl';
import { genUniqueId } from '@refly-packages/utils/id';
import { LinkMeta, useImportResourceStore } from '@refly-packages/ai-workspace-common/stores/import-resource';
// request
import getClient from '@refly-packages/ai-workspace-common/requests/proxiedRequest';
import {
  BatchCreateResourceData,
  Collection,
  CreateResourceData,
  SearchResult,
  UpsertResourceRequest,
} from '@refly/openapi-schema';
import { useFetchOrSearchList } from '@refly-packages/ai-workspace-common/hooks/use-fetch-or-search-list';
import { useReloadListState } from '@refly/ai-workspace-common/stores/reload-list-state';
import { useSearchParams } from '@refly-packages/ai-workspace-common/utils/router';

const { TextArea } = Input;
const Option = Select.Option;

export const ImportFromText = () => {
  const [linkStr, setLinkStr] = useState('');
  const importResourceStore = useImportResourceStore();

  const reloadListState = useReloadListState();
  const [queryParams] = useSearchParams();
  const kbId = queryParams.get('kbId');

  //
  const [saveLoading, setSaveLoading] = useState(false);

  // search
  const [searchValue, setSearchValue] = useState('new-collection');

  const { loadMore, hasMore, dataList, isRequesting, currentPage, handleValueChange, mode } = useFetchOrSearchList({
    fetchData: async (queryPayload) => {
      const res = await getClient().listCollections({
        query: {
          ...queryPayload,
        },
      });

      const data: SearchResult[] = (res?.data?.data || []).map((item) => ({
        id: item?.collectionId,
        title: item?.title,
        domain: 'collection',
      }));
      return { success: res?.data?.success, data };
    },
  });

  const handleSave = async () => {
    setSaveLoading(true);
    const { copiedTextPayload, selectedCollectionId } = useImportResourceStore.getState();
    if (!copiedTextPayload?.content || !copiedTextPayload?.title) {
      message.warning('标题和文本内容不能为空！');
      return;
    }

    const createResourceData: UpsertResourceRequest = {
      resourceType: 'text',
      title: copiedTextPayload?.title,
      content: copiedTextPayload?.content,
      collectionId: selectedCollectionId === 'new-collection' ? undefined : selectedCollectionId,
    };

    try {
      const res = await getClient().createResource({
        body: createResourceData,
      });

      if (!res?.data?.success) {
        setSaveLoading(false);
        message.error('保存失败');
        return;
      }

      message.success('保存成功');
      importResourceStore.setCopiedTextPayload({ title: '', content: '' });
      importResourceStore.setImportResourceModalVisible(false);
      if (selectedCollectionId === kbId) {
        reloadListState.setReloadKnowledgeBaseList(true);
        reloadListState.setReloadResourceList(true);
      }
      setLinkStr('');
    } catch (err) {
      message.error('保存失败');
    }

    setSaveLoading(false);
  };

  useEffect(() => {
    loadMore();
    importResourceStore.setSelectedCollectionId(kbId);
    return () => {
      /* reset selectedCollectionId after modal hide */
      importResourceStore.setSelectedCollectionId('');
    };
  }, []);

  return (
    <div className="intergation-container intergation-import-from-weblink">
      <div className="intergation-content">
        <div className="intergation-operation-container">
          <div className="intergration-header">
            <span className="menu-item-icon">
              <IconPen />
            </span>
            <span className="intergration-header-title">复制文本</span>
          </div>
          <Divider />
          <div className="intergation-body">
            <div className="intergation-body-action">
              <Input
                placeholder="输入标题"
                value={importResourceStore.copiedTextPayload?.title}
                onChange={(value) => importResourceStore.setCopiedTextPayload({ title: value })}
              />
              <TextArea
                placeholder="输入或粘贴文本"
                rows={4}
                autoSize={{
                  minRows: 4,
                  maxRows: 8,
                }}
                style={{ marginTop: '12px' }}
                showWordLimit
                maxLength={6000}
                value={importResourceStore.copiedTextPayload?.content}
                allowClear
                onChange={(value) => importResourceStore.setCopiedTextPayload({ content: value })}
              />
            </div>
          </div>
        </div>
      </div>
      <Affix offsetBottom={0} target={() => document.querySelector('.import-resource-right-panel') as HTMLElement}>
        <div className="intergation-footer">
          <div className="footer-location">
            <p className="text-item">保存至 </p>
            <Select
              size="large"
              placeholder="选择保存知识库"
              showSearch
              className={'kg-selector'}
              defaultValue={`${kbId || 'new-collection'}`}
              onInputValueChange={(value) => {
                handleValueChange(value);
              }}
              onChange={(value) => {
                console.log('value', value);
                if (!value) return;
                //   handleValueChange(value);
                if (value === 'new-collection') {
                  importResourceStore.setSelectedCollectionId('new-collection');
                } else {
                  importResourceStore.setSelectedCollectionId(value);
                }
              }}
              dropdownRender={(menu) => (
                <div>
                  {menu}
                  {mode === 'fetch' && hasMore ? (
                    <div className="search-load-more">
                      <Button type="text" loading={isRequesting} onClick={() => loadMore()}>
                        加载更多
                      </Button>
                    </div>
                  ) : null}
                </div>
              )}
            >
              <Option key="new-collection" value="new-collection">
                新建知识库
              </Option>
              {dataList?.map((item, index) => (
                <Option key={`${item?.id}-${index}`} value={item?.id}>
                  <span dangerouslySetInnerHTML={{ __html: item?.title }}></span>
                </Option>
              ))}
            </Select>
          </div>
          <div className="footer-action">
            <Button
              style={{ width: 72, marginRight: 8 }}
              onClick={() => importResourceStore.setImportResourceModalVisible(false)}
            >
              取消
            </Button>
            <Button type="primary" style={{ width: 100 }} onClick={handleSave}>
              保存
            </Button>
          </div>
        </div>
      </Affix>
    </div>
  );
};
