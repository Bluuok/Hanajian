package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Bluuok/TraceDigest/services/wechat-connector/ilink"
)

func TestSendRequiresExplicitToken(t *testing.T) {
	t.Setenv("WECHAT_CONNECTOR_API_TOKEN", "test-secret")
	server := NewServer(nil, "")
	for _, token := range []string{"", "Bearer incorrect", "Bearer test-secret"} {
		req := httptest.NewRequest(http.MethodPost, "/api/send", strings.NewReader(`{"to":"me","text":"![image](http://localhost/private)"}`))
		req.Header.Set("Authorization", token)
		rec := httptest.NewRecorder()
		server.handleSend(rec, req)
		want := http.StatusUnauthorized
		if token == "Bearer test-secret" {
			want = http.StatusServiceUnavailable
		}
		if rec.Code != want {
			t.Fatalf("got status %d, want %d", rec.Code, want)
		}
	}
}

func TestSendDisabledWithoutConfiguredToken(t *testing.T) {
	t.Setenv("WECHAT_CONNECTOR_API_TOKEN", "")
	server := NewServer(nil, "")
	rec := httptest.NewRecorder()
	server.handleSend(rec, httptest.NewRequest(http.MethodPost, "/api/send", strings.NewReader(`{"to":"me","text":"hello"}`)))
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("unconfigured API must reject sends")
	}
}

func TestClientForAccountSelectsMatchingBot(t *testing.T) {
	oldClient := ilink.NewClient(&ilink.Credentials{ILinkBotID: "bot-old"})
	newClient := ilink.NewClient(&ilink.Credentials{ILinkBotID: "bot-new"})
	server := NewServer([]*ilink.Client{oldClient, newClient}, "")

	if got := server.clientForAccount("bot-new"); got != newClient {
		t.Fatal("clientForAccount did not select the requested account")
	}
	if got := server.clientForAccount("missing"); got != nil {
		t.Fatal("clientForAccount should reject an unknown account")
	}
}
