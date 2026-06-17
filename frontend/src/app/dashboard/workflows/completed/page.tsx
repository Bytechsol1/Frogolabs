'use client';

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { CheckCircle2, History } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export default function CompletedWorkflowsPage() {
    return (
        <div className="space-y-6 animate-in fade-in duration-700">
            <div>
                <h2 className="text-3xl font-bold tracking-tight text-primary">Completed Workflows</h2>
                <p className="text-muted-foreground">Historical records of finalized diagnostic journeys.</p>
            </div>

            <Card className="border-none shadow-md rounded-3xl overflow-hidden">
                <CardHeader className="bg-emerald-500/5 border-b border-emerald-500/10">
                    <CardTitle className="text-xl flex items-center gap-2">
                        <History className="w-6 h-6 text-emerald-600" /> Archive Records
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-slate-50/50">
                            <TableRow>
                                <TableHead className="font-bold">Patient</TableHead>
                                <TableHead className="font-bold">Final Status</TableHead>
                                <TableHead className="font-bold">Completed Date</TableHead>
                                <TableHead className="text-right font-bold">Action</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            <TableRow>
                                <TableCell colSpan={4} className="h-64 text-center text-muted-foreground italic">
                                    <div className="flex flex-col items-center justify-center gap-3">
                                        <CheckCircle2 className="w-12 h-12 opacity-10" />
                                        <p>Archive database is being synchronized...</p>
                                    </div>
                                </TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
