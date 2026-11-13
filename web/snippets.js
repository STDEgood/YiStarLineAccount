/* YiStarLine Account · 开发者页面的代码示例（纯文本，可整体复制） */
(function (global) {
  'use strict';

  function join(lines) { return lines.join('\n'); }

  var browser = join([
    '<!-- 1. Load the local SDK: YiStarLineAccount\\web\\yl-sso.js -->',
    '<script src="/yl-sso.js"></script>',
    '',
    '<!-- 2. Start the authorization from your product page -->',
    '<button id="yl-login">Sign in with YiStarLine</button>',
    '<script>',
    "  document.getElementById('yl-login').onclick = async () => {",
    '    const { ticket, state } = await YLAccount.login({',
    "      appId: 'ylc_your_app_id',",
    "      redirectUri: location.origin + '/sso/callback',",
    '    });',
    '    // Send the ticket to your own backend. Never expose app_secret here.',
    "    const res = await fetch('/api/sso/exchange', {",
    "      method: 'POST',",
    "      headers: { 'Content-Type': 'application/json' },",
    '      body: JSON.stringify({ ticket, state }),',
    '    });',
    '    const me = await res.json();',
    '    console.log(me.user);',
    '  };',
    '</script>',
    '',
    '<!-- 3. The callback page /sso/callback needs one line -->',
    '<script src="/yl-sso.js"></script>',
    '<script>YLAccount.handleCallback();</script>'
  ]);

  var python = join([
    '# Product backend: exchange a one-time ticket for the user (stdlib only)',
    'import json',
    'import urllib.request',
    '',
    'SSO = "http://127.0.0.1:8600"',
    'APP_ID = "ylc_your_app_id"',
    'APP_SECRET = "ylsec_your_app_secret"   # server side only',
    '',
    '',
    'def redeem(ticket):',
    '    body = json.dumps({',
    '        "app_id": APP_ID,',
    '        "app_secret": APP_SECRET,',
    '        "ticket": ticket,',
    '    }).encode("utf-8")',
    '    req = urllib.request.Request(',
    '        SSO + "/api/v1/ticket/redeem",',
    '        data=body,',
    '        headers={"Content-Type": "application/json"},',
    '    )',
    '    with urllib.request.urlopen(req, timeout=5) as resp:',
    '        data = json.loads(resp.read().decode("utf-8"))',
    '    return data["user"], data["access_token"]',
    '',
    '',
    'def userinfo(token):',
    '    req = urllib.request.Request(',
    '        SSO + "/api/v1/userinfo",',
    '        headers={"Authorization": "Bearer " + token},',
    '    )',
    '    with urllib.request.urlopen(req, timeout=5) as resp:',
    '        return json.loads(resp.read().decode("utf-8"))["user"]'
  ]);

  var node = join([
    '// Product backend: redeem a ticket and read the profile (Node.js 18+)',
    "const SSO = 'http://127.0.0.1:8600';",
    "const APP_ID = 'ylc_your_app_id';",
    "const APP_SECRET = process.env.YL_APP_SECRET; // server side only",
    '',
    'export async function redeem(ticket) {',
    '  const res = await fetch(`${SSO}/api/v1/ticket/redeem`, {',
    "    method: 'POST',",
    "    headers: { 'Content-Type': 'application/json' },",
    '    body: JSON.stringify({ app_id: APP_ID, app_secret: APP_SECRET, ticket }),',
    '  });',
    "  if (!res.ok) throw new Error('ticket redeem failed');",
    '  return res.json(); // { user, access_token, expires_in }',
    '}',
    '',
    'export async function userinfo(accessToken) {',
    '  const res = await fetch(`${SSO}/api/v1/userinfo`, {',
    '    headers: { Authorization: `Bearer ${accessToken}` },',
    '  });',
    '  return res.json();',
    '}'
  ]);

  var csharp = join([
    '// Product backend (.NET): redeem a ticket',
    'using System;',
    'using System.Net.Http;',
    'using System.Text;',
    'using System.Text.Json;',
    'using System.Threading.Tasks;',
    '',
    'public static class YiStarLineSso',
    '{',
    '    private const string Sso = "http://127.0.0.1:8600";',
    '    private const string AppId = "ylc_your_app_id";',
    '    private static readonly HttpClient Http = new HttpClient();',
    '    private static readonly string AppSecret = Environment.GetEnvironmentVariable("YL_APP_SECRET");',
    '',
    '    public static async Task<JsonElement> RedeemAsync(string ticket)',
    '    {',
    '        string payload = JsonSerializer.Serialize(new { app_id = AppId, app_secret = AppSecret, ticket });',
    '        using (var content = new StringContent(payload, Encoding.UTF8, "application/json"))',
    '        using (HttpResponseMessage response = await Http.PostAsync(Sso + "/api/v1/ticket/redeem", content))',
    '        {',
    '            response.EnsureSuccessStatusCode();',
    '            string body = await response.Content.ReadAsStringAsync();',
    '            return JsonDocument.Parse(body).RootElement.Clone();',
    '        }',
    '    }',
    '}'
  ]);

  var curl = join([
    '# Health check',
    'curl http://127.0.0.1:8600/api/v1/health',
    '',
    '# Redeem a ticket (returns user and access_token)',
    'curl -X POST http://127.0.0.1:8600/api/v1/ticket/redeem \\',
    '  -H "Content-Type: application/json" \\',
    '  -d \'{"app_id":"ylc_xxx","app_secret":"ylsec_xxx","ticket":"ylt_xxx"}\'',
    '',
    '# Read the user profile',
    'curl http://127.0.0.1:8600/api/v1/userinfo \\',
    '  -H "Authorization: Bearer yla_xxx"',
    '',
    '# Revoke the access token',
    'curl -X POST http://127.0.0.1:8600/api/v1/logout \\',
    '  -H "Authorization: Bearer yla_xxx"'
  ]);

  global.YL_SNIPPETS = {
    browser: { label: 'Browser', code: browser },
    python: { label: 'Python', code: python },
    node: { label: 'Node.js', code: node },
    csharp: { label: 'C#', code: csharp },
    curl: { label: 'cURL', code: curl }
  };
})(window);
