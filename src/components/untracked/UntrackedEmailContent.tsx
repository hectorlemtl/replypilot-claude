import { Mail, Paperclip, ExternalLink } from "lucide-react";

interface UntrackedEmailContentProps {
  email: any | null;
  isLoading: boolean;
}

export function UntrackedEmailContent({ email, isLoading }: UntrackedEmailContentProps) {
  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-pulse text-xs text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!email) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
        <Mail className="w-10 h-10 mb-3 opacity-30" />
        <p className="text-sm">Select an email to view</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border shrink-0 space-y-2">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-foreground truncate">
              {email.subject || "(No subject)"}
            </h2>
          </div>
          {email.has_attachment && (
            <Paperclip className="w-3.5 h-3.5 text-muted-foreground shrink-0 ml-2" />
          )}
        </div>

        <div className="space-y-1 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <span className="font-medium text-foreground">From:</span>
            <span>{email.sender_name ? `${email.sender_name} <${email.sender_email}>` : email.sender_email}</span>
          </div>
          {email.recipient_email && (
            <div className="flex items-center gap-1">
              <span className="font-medium text-foreground">To:</span>
              <span>{email.recipient_email}</span>
            </div>
          )}
          {email.cc && (
            <div className="flex items-center gap-1">
              <span className="font-medium text-foreground">CC:</span>
              <span>{email.cc}</span>
            </div>
          )}
          {email.email_account && (
            <div className="flex items-center gap-1">
              <span className="font-medium text-foreground">Account:</span>
              <span>{email.email_account}</span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <span className="font-medium text-foreground">Received:</span>
            <span>{new Date(email.received_at).toLocaleString()}</span>
          </div>
          {email.instantly_campaign_id && (
            <div className="flex items-center gap-1 text-amber-600">
              <ExternalLink className="w-3 h-3" />
              <span className="font-medium">Has campaign association</span>
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4">
        {email.body_html ? (
          <div
            className="prose prose-sm max-w-none text-foreground [&_a]:text-primary"
            dangerouslySetInnerHTML={{ __html: email.body_html }}
          />
        ) : email.body_text ? (
          <pre className="text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed">
            {email.body_text}
          </pre>
        ) : email.content_preview ? (
          <p className="text-sm text-muted-foreground italic">{email.content_preview}</p>
        ) : (
          <p className="text-sm text-muted-foreground italic">No email body available</p>
        )}
      </div>
    </div>
  );
}
