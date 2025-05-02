/* ------------------------------------------------------------------
   Members / Invites – Commissioner view
   ------------------------------------------------------------------ */
   import React, { useState, useEffect } from "react";
   import {
     Box, Card, CardContent, Typography, Stack, Button,
     Alert, TextField, CircularProgress, IconButton, Tooltip,
   } from "@mui/material";
   import ContentCopyIcon   from "@mui/icons-material/ContentCopy";
   import RotateRightIcon   from "@mui/icons-material/RotateRight";
   import PersonRemoveIcon  from "@mui/icons-material/PersonRemove";
   
   import {
     collection, onSnapshot, doc, updateDoc, arrayRemove,
   } from "firebase/firestore";
   import { useOutletContext } from "react-router-dom";
   
   import { getDb, getAnalyticsService } from "../../../firebase/config";
   import { logEvent } from "firebase/analytics";
   import { generateInviteCode, copyTextToClipboard } from "../../../utils/helpers";
   
   export default function CommissionerMembersPage() {
     /* ––– grab shared ctx from <Outlet /> ––– */
     const { user, poolId, poolData } = useOutletContext() || {};
     const isCommish = poolData?.commissionerId === user?.uid;
     const db        = getDb();
     const analytics = getAnalyticsService();
   
     /* ––– local state ––– */
     const [members, setMembers]   = useState([]);
     const [loading, setLoading]   = useState(true);
     const [error,   setError]     = useState("");
     const [msg,     setMsg]       = useState("");
     const [regenBusy, setRegen]   = useState(false);
   
     /* ––– realtime listener ––– */
     useEffect(() => {
       const unsub = onSnapshot(
         collection(db, "pools", poolId, "participants"),
         snap => {
           const m = snap.docs.map(d => ({ id:d.id, ...d.data() }));
           setMembers(m);
           setLoading(false);
         },
         err => { setError("Failed to load members."); console.error(err); }
       );
       return () => unsub();
     }, [db, poolId]);
   
     /* ––– helpers ––– */
     const inviteURL = `${window.location.origin}/join?code=${poolData?.inviteCode}`;
   
     const handleCopy = async () => {
       await copyTextToClipboard(inviteURL);
       setMsg("Invite link copied!");
       analytics && logEvent(analytics,"copy_invite_link",{ userId:user.uid,poolId,ts:Date.now() });
     };
   
     const handleRegenerate = async () => {
       setRegen(true); setError(""); setMsg("");
       try{
         const newCode = generateInviteCode();
         await updateDoc(doc(db,"pools",poolId),{ inviteCode:newCode });
         setMsg("New invite code generated!");
         analytics && logEvent(analytics,"regen_invite_code",{ userId:user.uid,poolId,newCode,ts:Date.now() });
       }catch(e){ setError(e.message); }finally{ setRegen(false); }
     };
   
     const removeMember = async (memberId) => {
       if(memberId===user.uid){ return setError("You can’t remove yourself."); }
       setError(""); setMsg("");
       try{
         await updateDoc(doc(db,"pools",poolId),{
           memberIds: arrayRemove(memberId),
           [`membersMeta.${memberId}`]: arrayRemove(memberId),
         });
         await updateDoc(doc(db,"pools",poolId,"participants",memberId),{ removed:true });
         setMsg("Member removed.");
         analytics && logEvent(analytics,"remove_member",{ userId:user.uid,poolId,memberId,ts:Date.now() });
       }catch(e){ setError(e.message); }
     };
   
     /* ––– UI ––– */
     if(!isCommish) return null;
   
     return (
       <Card sx={{ mb:3 }}>
         <CardContent>
           <Typography variant="h6" sx={{ mb:2,fontWeight:600 }}>
             Members &amp; Invite Link
           </Typography>
   
           {error && <Alert severity="error"   sx={{mb:2}}>{error}</Alert>}
           {msg   && <Alert severity="success" sx={{mb:2}}>{msg}</Alert>}
   
           {/* ––– invite controls ––– */}
           <Stack direction={{xs:"column",sm:"row"}} spacing={2} sx={{ mb:3 }}>
             <TextField fullWidth size="small" value={inviteURL} InputProps={{readOnly:true}} />
             <Tooltip title="Copy link">
               <IconButton color="primary" onClick={handleCopy}><ContentCopyIcon /></IconButton>
             </Tooltip>
             <Tooltip title="Regenerate code">
               <span>
                 <IconButton color="warning" disabled={regenBusy} onClick={handleRegenerate}>
                   {regenBusy ? <CircularProgress size={20}/> : <RotateRightIcon />}
                 </IconButton>
               </span>
             </Tooltip>
           </Stack>
   
           {/* ––– member list ––– */}
           {loading ? (
             <CircularProgress />
           ) : (
             <Box>
               {members.map(m => (
                 <Stack key={m.id} direction="row" spacing={2} alignItems="center" sx={{ mb:1 }}>
                   <Typography sx={{ flexGrow:1 }}>
                     {m.displayName || m.email || m.name || "Member"} {m.id.startsWith("offline_") && "(offline)"}
                   </Typography>
                   <Tooltip title="Remove">
                     <IconButton color="error" onClick={()=>removeMember(m.id)}>
                       <PersonRemoveIcon />
                     </IconButton>
                   </Tooltip>
                 </Stack>
               ))}
               {members.length===0 && <Typography>No members yet.</Typography>}
             </Box>
           )}
         </CardContent>
       </Card>
     );
   }
   