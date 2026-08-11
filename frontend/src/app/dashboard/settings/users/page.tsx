'use client';

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ShieldAlert, UserPlus, Users } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function UserManagementPage() {
    return (
        <div className="space-y-6 animate-in fade-in duration-700">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight text-primary">User Management</h2>
                    <p className="text-muted-foreground">Manage platform access for Frigo Labs and Clinic staff.</p>
                </div>
                <Button className="rounded-xl font-bold">
                    <UserPlus className="w-4 h-4 mr-2" /> Invite User
                </Button>
            </div>

            <Card className="border-none shadow-md rounded-3xl overflow-hidden">
                <CardHeader className="bg-primary/5 border-b border-primary/10">
                    <CardTitle className="text-xl flex items-center gap-2">
                        <Users className="w-6 h-6 text-primary" /> Active Users
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-[#080e1e]/50">
                            <TableRow>
                                <TableHead className="font-bold">User</TableHead>
                                <TableHead className="font-bold">Role</TableHead>
                                <TableHead className="font-bold">Assigned Clinic</TableHead>
                                <TableHead className="text-right font-bold">Action</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            <TableRow>
                                <TableCell colSpan={4} className="h-64 text-center text-muted-foreground italic">
                                    <div className="flex flex-col items-center justify-center gap-3">
                                        <ShieldAlert className="w-12 h-12 opacity-10" />
                                        <p>User directory integration in progress.</p>
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
