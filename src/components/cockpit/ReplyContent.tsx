import { cn } from "@/lib/utils";
import { TemperatureBadge } from "@/components/TemperatureBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { ExternalLink, Check, X, FileText, Clock, Code, MessageCircle, Mail } from "lucide-react";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface ReplyContentProps {
  reply: any;
  isLoading: boolean;
}

export function ReplyContent({ reply, isLoading }: ReplyContentProps) {
  // Fetch thread history for SmartLead replies (other replies from same lead)
  const { data: threadReplies } = useQuery({
    queryKey: ["thread_history", reply?.lead_email, reply?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inbound_replies")
        .select("id, reply_text, reply_subject, received_at, status, source, sender_name, lead_name")
        .eq("lead_email", reply!.lead_email)
        .neq("id", reply!.id)
        .order("received_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!reply?.lead_email,
  });

  if (isLoading) {
    return (
      <div className="flex flex-col h-full p-4 space-y-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-[200px]" />
      </div>
    );
  }

  if (!reply) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-muted-foreground">
        <p className="text-sm">Select a reply to review</p>
        <p className="text-xs mt-1">Use J/K to navigate the queue</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header - compact metadata */}
      <div className="p-3 border-b border-border shrink-0 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground truncate">
            {reply.lead_name || reply.lead_email}
          </span>
          <TemperatureBadge temperature={reply.temperature} />
          <StatusBadge status={reply.status} />
          <span className={cn(
            "text-[10px] font-medium px-1.5 py-0.5 rounded",
            reply.source === "smartlead"
              ? "bg-blue-50 text-blue-700 border border-blue-200"
              : "bg-violet-50 text-violet-700 border border-violet-200"
          )}>
            {reply.source === "smartlead" ? "SmartLead" : "Instantly"}
          </span>
          {reply.source === "smartlead" ? (
            <a
              href={reply.smartlead_lead_id
                ? `https://app.smartlead.ai/app/master-inbox?action=INBOX&leadMap=${reply.smartlead_lead_id}`
                : "https://app.smartlead.ai/app/master-inbox"}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 shrink-0"
            >
              <ExternalLink className="w-3 h-3" />
              SmartLead
            </a>
          ) : reply.instantly_unibox_url ? (
            <a
              href={reply.instantly_unibox_url}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-xs text-primary hover:text-frozen flex items-center gap-1 shrink-0"
            >
              <ExternalLink className="w-3 h-3" />
              Instantly
            </a>
          ) : null}
        </div>

        {/* Email header — From / To / CC */}
        <div className="text-[11px] text-muted-foreground space-y-0.5">
          <div>
            <span className="font-medium text-foreground/70 w-8 inline-block">From:</span>{" "}
            {reply.sender_name || reply.lead_name || reply.lead_email} &lt;{reply.sender_email || reply.lead_email}&gt;
            {reply.sender_email && reply.sender_email !== reply.lead_email && (
              <span className="ml-1.5 text-[10px] text-warning-foreground bg-warning/15 px-1 rounded">on behalf of {reply.lead_name}</span>
            )}
          </div>
          {reply.email_account && (
            <div><span className="font-medium text-foreground/70 w-8 inline-block">To:</span> {reply.email_account}</div>
          )}
          {reply.cc_emails && reply.cc_emails.length > 0 && (
            <div><span className="font-medium text-foreground/70 w-8 inline-block">CC:</span> {reply.cc_emails.join(", ")}</div>
          )}
          {reply.reply_subject && (
            <div><span className="font-medium text-foreground/70 w-8 inline-block">Re:</span> {reply.reply_subject}</div>
          )}
        </div>

        {/* Meta badges */}
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
          {reply.received_at && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {format(new Date(reply.received_at), "MMM d, h:mm a")}
            </span>
          )}
          {reply.wants_pdf && (
            <span className="flex items-center gap-1 text-primary font-medium">
              <FileText className="w-3 h-3" />
              Wants PDF
            </span>
          )}
          {reply.simple_affirmative && (
            <span className="flex items-center gap-1 text-success font-medium">
              <Check className="w-3 h-3" />
              Simple yes
            </span>
          )}
          {reply.first_reply_received_at && (
            <span className="flex items-center gap-1 text-amber-600 font-medium">
              <MessageCircle className="w-3 h-3" />
              1st reply
            </span>
          )}
        </div>
      </div>

      {/* Original reply body */}
      <div className="flex-1 p-3">
        <div className="bg-muted/40 rounded-lg p-3 text-sm whitespace-pre-wrap leading-relaxed">
          {reply.reply_text || "No text content"}
        </div>

        {/* AI classification — always visible, compact */}
        {reply.reasoning && (
          <div className="mt-2 px-3 py-1.5 rounded-md bg-primary/5 border border-primary/10 flex items-start gap-2">
            <span className="text-[10px] text-primary font-semibold shrink-0 mt-0.5">AI:</span>
            <p className="text-[11px] text-muted-foreground leading-snug">{reply.reasoning}</p>
          </div>
        )}

        {reply.processing_error && (
          <div className="mt-2 px-3 py-1.5 rounded-md bg-destructive/5 border border-destructive/10 flex items-start gap-2">
            <span className="text-[10px] text-destructive font-semibold shrink-0 mt-0.5">Error:</span>
            <p className="text-[11px] text-destructive/80 leading-snug break-all">{reply.processing_error}</p>
          </div>
        )}

        {/* Thread history — previous exchanges with this lead */}
        {threadReplies && threadReplies.length > 0 && (
          <div className="mt-4">
            <Accordion type="single" collapsible defaultValue="thread-history" className="w-full">
              <AccordionItem value="thread-history" className="border-border/50 border rounded-lg px-4 bg-amber-50/30">
                <AccordionTrigger className="py-3 text-xs font-medium hover:no-underline text-muted-foreground hover:text-foreground">
                  <div className="flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5" />
                    Thread History ({threadReplies.length} previous {threadReplies.length === 1 ? "reply" : "replies"})
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-3">
                    {threadReplies.map((tr) => (
                      <div key={tr.id} className="bg-white/60 border border-border/30 rounded-md p-3">
                        <div className="flex items-center gap-2 mb-1.5 text-[11px] text-muted-foreground">
                          <span className="font-medium text-foreground/70">{tr.sender_name || tr.lead_name}</span>
                          {tr.received_at && (
                            <span>{format(new Date(tr.received_at), "MMM d, h:mm a")}</span>
                          )}
                          <span className={cn(
                            "px-1.5 py-0.5 rounded text-[10px] font-medium",
                            tr.status === "sent" ? "bg-green-50 text-green-700" : "bg-gray-50 text-gray-600"
                          )}>
                            {tr.status}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-4">
                          {tr.reply_text || "No text content"}
                        </p>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        )}

        {/* Collapsible raw data */}
        <div className="mt-6">
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="raw-payload" className="border-border/50 border rounded-lg px-4 bg-card/50">
              <AccordionTrigger className="py-3 text-xs font-medium hover:no-underline text-muted-foreground hover:text-foreground">
                <div className="flex items-center gap-2">
                  <Code className="w-3.5 h-3.5" />
                  View Raw Webhook Payload
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="bg-muted p-3 rounded-md overflow-x-auto">
                  <pre className="text-[10px] text-muted-foreground leading-relaxed whitespace-pre-wrap break-all">
                    {JSON.stringify(reply.raw_payload, null, 2)}
                  </pre>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </div>
    </div>
  );
}
