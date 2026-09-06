import { useState } from 'react';
import type { ClientLink, RulesData } from '../../types/domain-rules';
import type { useDomainAdmin } from '../hooks/use-domain-admin';
import { UiMessage, type UiMessageKey } from '../i18n';
import { copyText } from '../lib/clipboard';
import { preferHttpsLink } from '../lib/links';
import { CategoryIcon } from './category-icon';
import { SortToolbar, sortCategoryEntries, usePersistentSort } from './sort-toolbar';
import { UiIcon } from './ui-icon';

type FormatLink = { id: string; title: UiMessageKey; suffix: string; description: UiMessageKey; tone: string; link?: ClientLink };
type AccessPolicy = 'token' | 'public' | 'disabled';

export function LinksPanel({ api, data, links, onToast }: { api: ReturnType<typeof useDomainAdmin>; data: RulesData; links: Record<string, ClientLink[]>; onToast: (message: string) => void }) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());
  const [selectedId, setSelectedId] = useState(() => new URLSearchParams(window.location.search).get('category') ?? '');
  const { value: sortKey, direction: sortDirection, setValue: setSortKey, setDirection: setSortDirection } = usePersistentSort('subscriptions');
  const selectedCategory = data.categories.find((category) => category.id === selectedId);
  const selectedLinks = selectedId ? links[selectedId] ?? [] : [];
  const sortedCategories = sortCategoryEntries(data.categories.map((category) => ({ category, count: category.ruleCount ?? category.rules.length })), sortKey, sortDirection).map((entry) => entry.category);
  const format = (id: string, title: UiMessageKey, suffix: string, description: UiMessageKey, tone: string): FormatLink => ({
    id, title, suffix, description, tone, link: selectedLinks.find((link) => link.id === id),
  });
  const groups: Array<{ id: string; title: UiMessageKey; formats: FormatLink[] }> = [
    { id: 'yaml', title: 'subscriptions.yaml', formats: [
      format('yaml-classical', 'subscriptions.classical', '_Classical.yaml', 'subscriptions.classicalDescription', 'cyan'),
      format('yaml-domain', 'subscriptions.domain', '_Domain.yaml', 'subscriptions.domainDescription', 'cyan'),
      format('yaml-ipcidr', 'subscriptions.ip', '_IPCIDR.yaml', 'subscriptions.ipDescription', 'cyan'),
    ] },
    { id: 'list', title: 'subscriptions.list', formats: [
      format('general', 'subscriptions.general', '.list', 'subscriptions.generalDescription', 'purple'),
      format('loon', 'subscriptions.loon', '-loon.list', 'subscriptions.loonDescription', 'purple'),
      format('quantumult-x', 'subscriptions.quantumultX', '-qx.list', 'subscriptions.qxDescription', 'purple'),
    ] },
    { id: 'json', title: 'subscriptions.json', formats: [
      format('json', 'subscriptions.json', '.json', 'subscriptions.jsonDescription', 'orange'),
    ] },
    { id: 'txt', title: 'subscriptions.txt', formats: [
      format('url', 'subscriptions.textTitle', '.txt', 'subscriptions.textDescription', 'blue'),
    ] },
  ];

  async function copy(link?: ClientLink) {
    if (!link?.recommendedUrl) { onToast('此规则当前未开放可用的订阅链接'); return; }
    await copyText(preferHttpsLink(link.recommendedUrl));
    onToast('订阅链接已复制');
  }
  async function setAccess(policy: AccessPolicy) {
    if (!selectedCategory) return;
    await api.updateCategory(selectedCategory.id, { tokenLinksEnabled: policy === 'token', publicLinksEnabled: policy === 'public' });
    onToast('规则访问策略已更新');
  }
  function toggleGroup(id: string) {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (!selectedCategory) return <div className="page-stack unified-page">
    <header className="page-title"><div><span className="eyebrow">SUBSCRIPTIONS</span><h1>订阅中心</h1><p>选择规则与文件格式，每种格式对应一个通用地址</p></div></header>
    <section className="soft-card unified-card"><div className="section-inline sort-section-head"><div><h2>选择规则</h2><p>每条规则的访问方式都可以单独设置</p></div><SortToolbar value={sortKey} direction={sortDirection} onChange={(key, direction) => { setSortKey(key); setSortDirection(direction); }}/></div><div className="category-summary-grid subscription-categories sort-content-transition" key={`${sortKey}-${sortDirection}`}>{sortedCategories.map((category) => { const policy = category.tokenLinksEnabled !== false ? '私密' : category.publicLinksEnabled !== false ? '公开' : '已禁用'; return <button className="category-summary-card" key={category.id} onClick={() => setSelectedId(category.id)}><CategoryIcon icon={category.icon} name={category.name}/><span><strong>{category.name}</strong><small>{category.enabledRuleCount ?? category.rules.filter((rule) => rule.enabled).length} 条启用规则</small></span><span className={`access-policy-badge ${policy === '已禁用' ? 'disabled' : ''}`}>{policy}</span><UiIcon name="chevronRight" size={19}/></button>; })}</div></section>
  </div>;

  const privateAccess = selectedCategory.tokenLinksEnabled !== false;
  const publicAccess = selectedCategory.publicLinksEnabled !== false;
  const accessPolicy: AccessPolicy = privateAccess ? 'token' : publicAccess ? 'public' : 'disabled';
  return <div className="page-stack unified-page">
    <header className="page-title detail-title"><div><button className="back-button" onClick={() => setSelectedId('')}><UiIcon name="arrowLeft" size={20}/>返回订阅中心</button><div className="detail-name"><CategoryIcon icon={selectedCategory.icon} name={selectedCategory.name} size={58}/><span><h1>{selectedCategory.name} 订阅</h1><p><UiMessage id="subscriptions.choose"/></p></span></div></div></header>
    <section className="soft-card unified-card subscription-access-card"><div><span className="metric-icon blue"><UiIcon name="settings"/></span><span><h2>规则访问策略</h2><p>只影响 {selectedCategory.name} 的订阅链接</p></span></div>{api.can('toggle') ? <select className="app-input access-policy-select" value={accessPolicy} onChange={(event) => setAccess(event.target.value as AccessPolicy)}><option value="token">私密访问（带密钥）</option><option value="public">公开访问</option><option value="disabled">禁止访问</option></select> : <strong>{accessPolicy === 'token' ? '私密访问' : accessPolicy === 'public' ? '公开访问' : '禁止访问'}</strong>}</section>
    <div className="access-banner"><span><UiIcon name="info" size={19}/>{privateAccess ? '优先使用私密地址' : publicAccess ? '当前使用公开地址' : '当前未开放订阅访问'}</span><small>系统会根据当前访问策略自动选择可用地址</small></div>
    <div className="subscription-format-groups">{groups.map((group) => { const expanded = expandedGroups.has(group.id); return <section className={`subscription-format-group${expanded ? ' expanded' : ''}`} key={group.id} data-format-group={group.id}>
      <button className="subscription-format-summary" type="button" aria-expanded={expanded} aria-controls={`subscription-format-${group.id}`} onClick={() => toggleGroup(group.id)}><strong><UiMessage id={group.title}/></strong><UiIcon name="chevron" size={18}/></button>
      <div className="subscription-format-content" id={`subscription-format-${group.id}`} aria-hidden={!expanded} inert={!expanded}><div className="format-link-grid">{group.formats.map((format) => <section className="format-link-card" key={format.id}>
        <div className="format-link-head"><span className={`metric-icon ${format.tone}`}><UiIcon name="file"/></span><code>{format.suffix}</code></div>
        <h2><UiMessage id={format.title}/></h2>
        <p><UiMessage id={format.description}/></p>
        <span className="format-file-name" data-no-translate>{format.link?.fileName}</span>
        <button className="primary-action icon-action" disabled={!format.link?.recommendedUrl} onClick={() => copy(format.link)}><UiIcon name="copy" size={17}/>复制订阅链接</button>
      </section>)}</div></div>
    </section>; })}</div>
  </div>;
}
