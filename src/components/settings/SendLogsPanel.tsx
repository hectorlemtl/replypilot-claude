import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { CheckCircle, XCircle } from "lucide-react";

export function SendLogsPanel() {
  const { data: logs, isLoading } = useQuery({
    queryKey: ["send_attempts_logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("send_attempts")
        .select(`
          *,
          inbound_replies (
            lead_email,
            reply_subject
          )
        `)
        .order("sent_at", { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data;
    },
    refetchInterval: 15000,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  if (!logs || logs.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No send attempts found.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {logs.map((log: any) => (
        <Card key={log.id}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {log.success ? (
                  <CheckCircle className="w-5 h-5 text-success" />
                ) : (
                  <XCircle className="w-5 h-5 text-destructive" />
                )}
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    {log.inbound_replies?.lead_email || "Unknown lead"}
                    <Badge variant="outline" className="text-[10px]">
                      {log.provider}
                    </Badge>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {format(new Date(log.sent_at), "MMM d, yyyy HH:mm:ss")}
                  </CardDescription>
                </div>
              </div>
              <Badge variant={log.success ? "default" : "destructive"} className={log.success ? "bg-success hover:bg-success/90" : ""}>
                {log.status_code || "N/A"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="request" className="border-b-0 border-t">
                <AccordionTrigger className="text-xs py-2 hover:no-underline">
                  Request Payload
                </AccordionTrigger>
                <AccordionContent>
                  <pre className="bg-muted p-3 rounded-md overflow-x-auto text-[10px] font-mono whitespace-pre-wrap max-h-60 overflow-y-auto">
                    {JSON.stringify(log.request_payload, null, 2)}
                  </pre>
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="response" className="border-b-0 border-t">
                <AccordionTrigger className="text-xs py-2 hover:no-underline">
                  Response Payload
                </AccordionTrigger>
                <AccordionContent>
                  <pre className="bg-muted p-3 rounded-md overflow-x-auto text-[10px] font-mono whitespace-pre-wrap max-h-60 overflow-y-auto">
                    {JSON.stringify(log.response_payload, null, 2)}
                  </pre>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
