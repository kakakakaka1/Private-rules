import { describe, expect, it } from 'vitest';
import { resolveSystemLocale, translateUiText } from '../../src/frontend/i18n';

const hasHanCharacters = (value: string) => /[\u3400-\u9fff]/u.test(value);

describe('English UI translations', () => {
  it.each([
    'example.com 及其子域名',
    'YAML 规则集',
    'LIST 规则集',
    '适用于 Mihomo、Clash、OpenClash 与 Stash',
    '仅保留域名与 IP，方便脚本或其他工具继续处理',
    '关于 Private Rules',
    '操作简单、维护方便的私有自托管规则控制台，支持 Cloudflare Workers 和 Docker Compose 部署',
    '按分类维护域名、关键词与 IP 规则，并按需组合上游来源',
    '统一生成 YAML、LIST、JSON 与纯地址文件，覆盖常用代理客户端',
    '可使用 Cloudflare Workers 与 D1，也可通过 Docker Compose 与 SQLite 自托管',
    '开源代码、更新记录与作者频道',
    '本项目仅供学习与技术测试使用，请遵守当地法律法规。使用者对配置、转发内容与访问行为承担全部责任，开发者不对任何直接或间接损失负责。',
  ])('does not leave Chinese text in %s', (source) => {
    expect(hasHanCharacters(translateUiText(source, 'en'))).toBe(false);
  });

  it('translates the dynamic domain suffix description naturally', () => {
    expect(translateUiText('example.com 及其子域名', 'en')).toBe('example.com and its subdomains');
  });

  it('translates a rule-specific subscription policy without changing its name', () => {
    expect(translateUiText('只影响 Emby 的订阅链接', 'en')).toBe("Only affects Emby's subscription links");
  });
});

describe('system locale resolution', () => {
  it('falls back to English for unsupported languages', () => {
    expect(resolveSystemLocale(['fr-FR'])).toBe('en');
  });
});
