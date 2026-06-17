'use client';

import { Card, CardContent } from "@/components/ui/card";
import { Bell } from "lucide-react";

export default function NotificationsPage() {
    return (
        <div className="space-y-6">
            <h2 className="text-3xl font-bold tracking-tight text-primary">Notifications</h2>
            <Card className="border-dashed border-2">
                <CardContent className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                    <Bell className="w-12 h-12 mb-4 opacity-20" />
                    <p className="font-medium">Messaging logs and alert history are being integrated.</p>
                </CardContent>
            </Card>
        </div>
    );
}
