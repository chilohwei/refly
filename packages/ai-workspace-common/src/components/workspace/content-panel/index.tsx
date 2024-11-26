import { useRef, useState, useEffect } from 'react';
import { Radio } from '@arco-design/web-react';
import { Affix } from 'antd';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { ResourceList } from '@refly-packages/ai-workspace-common/components/workspace/resource-list';
import { DocumentList } from '@refly-packages/ai-workspace-common/components/workspace/document-list';
import './index.scss';
import classNames from 'classnames';

const RadioGroup = Radio.Group;

const Content = (props: { val: string }) => {
  switch (props.val) {
    case 'resource':
      return <ResourceList />;
    case 'project':
      return <DocumentList />;
    default:
      return <ResourceList />;
  }
};

const ContentHeader = (props: { setVal: (val: string) => void; hitTop: boolean; val: string }) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { setVal, hitTop } = props;

  const handleTabChange = (key: string) => {
    setVal(key);
    navigate(`?tab=${key}`);
  };

  return (
    <div
      className={classNames(
        'content-panel-header',
        { 'content-panel-header-hit-top': hitTop },
        'relative flex justify-between items-center py-3 h-16',
      )}
    >
      <div className="flex items-center">
        <RadioGroup
          type="button"
          size="large"
          className="content-panel-radio-group"
          defaultValue="resource"
          value={props.val}
          onChange={(val) => handleTabChange(val)}
          style={{ borderRadius: 8 }}
        >
          <Radio value="canvas">{t('workspace.contentPanel.tabPanel.canvas')}</Radio>
          <Radio value="resource">{t('workspace.contentPanel.tabPanel.resource')}</Radio>
          <Radio value="project">{t('workspace.contentPanel.tabPanel.project')}</Radio>
        </RadioGroup>
      </div>
    </div>
  );
};

export const ContentPanel = () => {
  const ref = useRef();
  const [val, setVal] = useState('canvas');
  const [hitTop, setHitTop] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();

  useEffect(() => {
    const tab = searchParams.get('tab') as string;
    setVal(tab || 'canvas');
  }, [searchParams]);

  return (
    <div className="content-panel-container" ref={ref}>
      <Affix offsetTop={0} target={() => ref.current} onChange={setHitTop}>
        <ContentHeader val={val} setVal={setVal} hitTop={hitTop} />
      </Affix>
      <Content val={val} />
    </div>
  );
};
