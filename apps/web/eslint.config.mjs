import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // 本仓库一直用 `_` 前缀表示「刻意不用」（mock 里对齐真实签名的形参、
      // 只关心副作用的解构等）。此前配置没告诉 eslint 这个约定，于是 14 条
      // no-unused-vars 里有 11 条是在报「你故意标记的东西没用」——噪音，
      // 会淹没真正的死代码。
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],

      /**
       * error → warn，这是一个**判断**，不是图省事，理由记在这里以便日后推翻。
       *
       * 该规则防的是「effect 里 setState 引发级联重渲染」。接入时全仓 20 处命中，
       * 逐条读完后分三类，**没有一条是它要防的东西**：
       *   A. 挂载后读浏览器专有值（sessionStorage / location / DOM / cookie）——
       *      服务端根本拿不到，SSR 首帧必须先给中性值再切，否则水合错位。
       *      其中最普遍的「是否在 Telegram 里」已抽成 useIsTelegram()（见 lib/tg/ui.ts），
       *      规则例外只在那一处声明；剩下 4 处各读各的值，抽不成同一个 hook。
       *   B. 重置状态再发异步请求（setLoading(true) 后 fetch）——effect 与外部系统
       *      同步的标准写法，React 官方文档就是这个形状。
       *   C. 动画触发（setCasting(true) + setTimeout 清除）。
       *
       * 既然对本仓库的既有模式是 10/10 误报，留作 error 的唯一出路是写 10 条
       * eslint-disable。那更糟：抑制注释会腐烂，没人回头重估，而规则实际已被架空。
       * 降为 warn 后它仍在 CI 注解里可见，且 error 归零使 lint 可以转为阻塞闸门。
       *
       * ⚠️ 什么时候该改回 error：当 A 类通过 useSyncExternalStore 之类的方案系统性
       * 消除、且 B 类改为由数据状态派生 loading 之后。那是一次独立的重构，不该
       * 混在「清 lint」里做——那样会把真实行为改动藏进一次本应零风险的提交。
       */
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
