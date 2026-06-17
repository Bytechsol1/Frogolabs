'use client';

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { FlaskConical } from "lucide-react";

export default function ResultsPage() {
    return (
        <div className="space-y-6">
            <h2 className="text-3xl font-bold tracking-tight text-primary">Lab Results</h2>
            <Card className="border-dashed border-2">
                <CardContent className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                    <FlaskConical className="w-12 h-12 mb-4 opacity-20" />
                    <p className="font-medium">Global access to diagnostic reports is under initialization.</p>
                    <p className="text-xs">Individual results are available via the Patient Details page.</p>
                </CardContent>
            </Card>
        </div>
    );
}
