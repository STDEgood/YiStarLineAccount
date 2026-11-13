// YiStarLine Account · C# 客户端（.NET Framework 4.6+ / .NET 6+）
//
// 用法：
//   var sso = new YiStarLineSso("ylc_xxx", "ylsec_xxx");
//   var result = await sso.RedeemAsync(ticket);
//   var name = result.GetProperty("user").GetProperty("display_name").GetString();
//
// 注意：app_secret 只能保存在产品后端或本地桌面程序中，绝不能下发给网页前端。

using System;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

namespace YiStarLine
{
    public sealed class SsoException : Exception
    {
        public string Code { get; }
        public int Status { get; }

        public SsoException(string code, string message, int status) : base(message)
        {
            Code = code;
            Status = status;
        }
    }

    public sealed class YiStarLineSso
    {
        private static readonly HttpClient Http = new HttpClient { Timeout = TimeSpan.FromSeconds(8) };

        private readonly string _baseUrl;
        private readonly string _appId;
        private readonly string _appSecret;

        public YiStarLineSso(string appId, string appSecret, string baseUrl = "http://127.0.0.1:8600")
        {
            _appId = appId;
            _appSecret = appSecret;
            _baseUrl = (baseUrl ?? "http://127.0.0.1:8600").TrimEnd('/');
        }

        /// <summary>授权页地址，交给浏览器或 WebView 打开。</summary>
        public string AuthorizeUrl(string redirectUri, string state = "", string prompt = "")
        {
            string query = "app_id=" + Uri.EscapeDataString(_appId)
                + "&redirect_uri=" + Uri.EscapeDataString(redirectUri)
                + "&state=" + Uri.EscapeDataString(state ?? string.Empty);
            if (!string.IsNullOrEmpty(prompt))
            {
                query += "&prompt=" + Uri.EscapeDataString(prompt);
            }
            return _baseUrl + "/sso/authorize?" + query;
        }

        /// <summary>静默登录地址：已授权时直接回调 ticket。</summary>
        public string SilentUrl(string redirectUri, string state = "")
        {
            return AuthorizeUrl(redirectUri, state, "none");
        }

        /// <summary>用一次性票据换取用户资料与访问令牌。</summary>
        public async Task<JsonElement> RedeemAsync(string ticket)
        {
            string payload = JsonSerializer.Serialize(new
            {
                app_id = _appId,
                app_secret = _appSecret,
                ticket
            });
            return await PostAsync("/api/v1/ticket/redeem", payload);
        }

        /// <summary>产品自带登录框时，用账户密码直接换取访问令牌。</summary>
        public async Task<JsonElement> LoginAsync(string username, string password)
        {
            string payload = JsonSerializer.Serialize(new
            {
                app_id = _appId,
                app_secret = _appSecret,
                username,
                password
            });
            return await PostAsync("/api/v1/auth/login", payload);
        }

        /// <summary>读取访问令牌对应的用户。</summary>
        public async Task<JsonElement> UserInfoAsync(string accessToken)
        {
            using (var request = new HttpRequestMessage(HttpMethod.Get, _baseUrl + "/api/v1/userinfo"))
            {
                request.Headers.Authorization =
                    new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", accessToken);
                return await SendAsync(request);
            }
        }

        /// <summary>作废访问令牌。</summary>
        public async Task<bool> LogoutAsync(string accessToken)
        {
            using (var request = new HttpRequestMessage(HttpMethod.Post, _baseUrl + "/api/v1/logout"))
            {
                request.Headers.Authorization =
                    new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", accessToken);
                request.Content = new StringContent("{}", Encoding.UTF8, "application/json");
                JsonElement result = await SendAsync(request);
                return result.TryGetProperty("ok", out JsonElement ok) && ok.GetBoolean();
            }
        }

        /// <summary>校验 app_id / app_secret 是否匹配，可用于启动自检。</summary>
        public async Task<JsonElement> VerifyAsync()
        {
            string payload = JsonSerializer.Serialize(new { app_id = _appId, app_secret = _appSecret });
            return await PostAsync("/api/v1/app/verify", payload);
        }

        public async Task<JsonElement> HealthAsync()
        {
            using (var request = new HttpRequestMessage(HttpMethod.Get, _baseUrl + "/api/v1/health"))
            {
                return await SendAsync(request);
            }
        }

        /// <summary>从回调地址解析 ticket / state。</summary>
        public static (string Ticket, string State, string Error) ParseCallback(string url)
        {
            var uri = new Uri(url, UriKind.Absolute);
            string query = uri.Query.TrimStart('?');
            string ticket = string.Empty, state = string.Empty, error = string.Empty;
            foreach (string pair in query.Split('&'))
            {
                if (pair.Length == 0) continue;
                int index = pair.IndexOf('=');
                if (index < 0) continue;
                string key = pair.Substring(0, index);
                string value = Uri.UnescapeDataString(pair.Substring(index + 1).Replace("+", " "));
                if (key == "ticket") ticket = value;
                else if (key == "state") state = value;
                else if (key == "error") error = value;
            }
            return (ticket, state, error);
        }

        private Task<JsonElement> PostAsync(string path, string json)
        {
            var request = new HttpRequestMessage(HttpMethod.Post, _baseUrl + path)
            {
                Content = new StringContent(json, Encoding.UTF8, "application/json")
            };
            return SendAsync(request);
        }

        private static async Task<JsonElement> SendAsync(HttpRequestMessage request)
        {
            request.Headers.Accept.ParseAdd("application/json");
            using (HttpResponseMessage response = await Http.SendAsync(request))
            {
                string body = await response.Content.ReadAsStringAsync();
                JsonElement root;
                try
                {
                    using (JsonDocument document = JsonDocument.Parse(body))
                    {
                        root = document.RootElement.Clone();
                    }
                }
                catch (JsonException)
                {
                    throw new SsoException("invalid_response", "Response is not valid JSON", (int)response.StatusCode);
                }
                if (!response.IsSuccessStatusCode)
                {
                    string code = "http_error";
                    string message = "HTTP " + (int)response.StatusCode;
                    if (root.TryGetProperty("error", out JsonElement error))
                    {
                        if (error.TryGetProperty("code", out JsonElement c)) code = c.GetString() ?? code;
                        if (error.TryGetProperty("message", out JsonElement m)) message = m.GetString() ?? message;
                    }
                    throw new SsoException(code, message, (int)response.StatusCode);
                }
                return root;
            }
        }
    }
}
